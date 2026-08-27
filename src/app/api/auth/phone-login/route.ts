import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyPin } from "@/lib/attendance-auth";
import { normalizePhone } from "@/lib/auth-errors";

const bodySchema = z.object({ mobile: z.string().min(1), pin: z.string().min(1) });

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Dashboard login via mobile number + PIN, alongside (not replacing) email+password.
 *
 * Authenticates the person our own way — bcrypt PIN compare + the same 5-attempt/15-minute
 * lockout as attendance login — then bridges into a REAL Supabase Auth session so
 * getServerUser() and every existing API route keep working completely unchanged: a PIN is
 * never used as a Supabase Auth password (a 4-digit PIN would also fail Supabase's minimum
 * password length). admin.generateLink() mints a one-time numeric OTP for the account's email
 * with no email actually sent, and verifyOtp() on this request's cookie-writing client redeems
 * it immediately, setting real session cookies on the response.
 */
export async function POST(request: Request) {
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Phone login is not configured" }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter your mobile number and PIN" }, { status: 400 });
  const mobile = normalizePhone(parsed.data.mobile);
  const pin = parsed.data.pin;

  // Same generic message regardless of which check failed — never confirm whether a mobile
  // number belongs to a real account, same posture as attendance login.
  const genericError = () => NextResponse.json({ error: "Invalid mobile number or PIN" }, { status: 401 });

  const { data: userRow } = await serviceClient
    .from("user_roles")
    .select("email, linked_employee_id, pin_hash, failed_pin_attempts, pin_locked_until")
    .eq("phone", mobile)
    .maybeSingle();
  if (!userRow) return genericError();

  // "Same PIN when linked": the linked employee's own pin_hash/lockout is the single source of
  // truth for both attendance check-in and dashboard login — this user_roles row's own pin_hash
  // stays unused in that case (see add_dashboard_pin_login.sql).
  let pinHash: string | null;
  let failedAttempts: number;
  let lockedUntil: string | null;

  if (userRow.linked_employee_id) {
    const { data: employee } = await serviceClient
      .from("employees")
      .select("pin_hash, failed_pin_attempts, pin_locked_until")
      .eq("id", userRow.linked_employee_id)
      .maybeSingle();
    if (!employee) return genericError();
    pinHash = employee.pin_hash;
    failedAttempts = employee.failed_pin_attempts;
    lockedUntil = employee.pin_locked_until;
  } else {
    pinHash = userRow.pin_hash;
    failedAttempts = userRow.failed_pin_attempts;
    lockedUntil = userRow.pin_locked_until;
  }

  if (!pinHash) return genericError();

  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60_000);
    return NextResponse.json({ error: `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` }, { status: 429 });
  }

  const valid = await verifyPin(pin, pinHash);
  if (!valid) {
    const attempts = failedAttempts + 1;
    const lockedOut = attempts >= MAX_FAILED_ATTEMPTS;
    const update = {
      failed_pin_attempts: attempts,
      pin_locked_until: lockedOut ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : null,
    };
    if (userRow.linked_employee_id) {
      await serviceClient.from("employees").update(update).eq("id", userRow.linked_employee_id);
    } else {
      await serviceClient.from("user_roles").update(update).eq("email", userRow.email);
    }
    return genericError();
  }

  if (userRow.linked_employee_id) {
    await serviceClient.from("employees").update({ failed_pin_attempts: 0, pin_locked_until: null }).eq("id", userRow.linked_employee_id);
  } else {
    await serviceClient.from("user_roles").update({ failed_pin_attempts: 0, pin_locked_until: null }).eq("email", userRow.email);
  }

  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email: userRow.email,
  });
  if (linkError || !linkData?.properties?.email_otp) {
    return NextResponse.json({ error: "Couldn't complete sign-in. Try again." }, { status: 500 });
  }

  const sessionClient = await createClient();
  const { error: verifyError } = await sessionClient.auth.verifyOtp({
    email: userRow.email,
    token: linkData.properties.email_otp,
    type: "magiclink",
  });
  if (verifyError) {
    return NextResponse.json({ error: "Couldn't complete sign-in. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
