import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyPin, signAttendanceToken, isAttendanceConfigured, ATTENDANCE_COOKIE_NAME, ATTENDANCE_COOKIE_MAX_AGE } from "@/lib/attendance-auth";

const bodySchema = z.object({ mobile: z.string().min(1), pin: z.string().min(1) });

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Employee self-service login — mobile + PIN, entirely separate from the app's normal
 * Supabase Auth login. Uses the service client throughout because the caller has no Supabase
 * session at all (not even "anon" in the RLS sense that matters here — this runs before any
 * identity exists), so RLS can't be relied on; this route IS the access control.
 */
export async function POST(request: Request) {
  if (!isAttendanceConfigured()) return NextResponse.json({ error: "Attendance login is not configured" }, { status: 503 });
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance login is not configured" }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter your mobile number and PIN" }, { status: 400 });
  const { mobile, pin } = parsed.data;

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, pin_hash, active, failed_pin_attempts, pin_locked_until")
    .eq("mobile", mobile.trim())
    .maybeSingle();

  // Same generic message whether the mobile doesn't match, the account is inactive, or no PIN
  // has been set — never reveal which, so a wrong-mobile guess can't be distinguished from a
  // wrong-PIN guess.
  const genericError = () => NextResponse.json({ error: "Invalid mobile number or PIN" }, { status: 401 });

  if (!employee || !employee.active || !employee.pin_hash) return genericError();

  if (employee.pin_locked_until && new Date(employee.pin_locked_until).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(employee.pin_locked_until).getTime() - Date.now()) / 60_000);
    return NextResponse.json({ error: `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` }, { status: 429 });
  }

  const valid = await verifyPin(pin, employee.pin_hash);
  if (!valid) {
    const attempts = (employee.failed_pin_attempts || 0) + 1;
    const lockedOut = attempts >= MAX_FAILED_ATTEMPTS;
    await supabase
      .from("employees")
      .update({
        failed_pin_attempts: lockedOut ? 0 : attempts,
        pin_locked_until: lockedOut ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", employee.id);
    return genericError();
  }

  await supabase.from("employees").update({ failed_pin_attempts: 0, pin_locked_until: null }).eq("id", employee.id);

  const token = signAttendanceToken(employee.id);
  const cookieStore = await cookies();
  cookieStore.set(ATTENDANCE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ATTENDANCE_COOKIE_MAX_AGE,
  });

  return NextResponse.json({ ok: true, employeeName: employee.name });
}
