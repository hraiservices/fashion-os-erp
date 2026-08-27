import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizePhone } from "@/lib/auth-errors";
import { isValidPin, hashPin } from "@/lib/attendance-auth";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  mobile: z.string().min(1),
  pin: z.string(),
  role: z.enum(["admin", "manager", "sales", "tailor"]),
  custom: z.record(z.string(), z.boolean()).optional(),
});

/**
 * Creates a brand-new dashboard login that has no real email at all — phone number + PIN only,
 * exactly what "assign a phone number and a PIN" (no email involved) needs. Every existing
 * user_roles row today is provisioned by email and only gets a real Supabase Auth user once the
 * person self-signs-up with matching email+password (see ensureUserRole()) — a phone-only
 * person has no such self-signup path, so this route creates BOTH the actual Supabase Auth user
 * (via the admin API, service-role only) and the user_roles row together, in one place.
 *
 * The synthetic email is never shown to the person and nothing is ever sent to it — login is
 * exclusively via /api/auth/phone-login from here on. Its Supabase Auth password is a random
 * string thrown away immediately; it's never used (or usable) for a real password login.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const mobile = normalizePhone(fd.mobile);
  if (mobile.length !== 10) return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
  if (!isValidPin(fd.pin)) return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });

  const { data: existing } = await supabase.from("user_roles").select("email").eq("phone", mobile).maybeSingle();
  if (existing) return NextResponse.json({ error: `This mobile number is already assigned to ${existing.email}` }, { status: 409 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to create phone logins (missing service role key)" }, { status: 501 });

  const syntheticEmail = `p${mobile}@dashboard.local`;
  const throwawayPassword = randomBytes(24).toString("base64url");

  const { error: createError } = await serviceClient.auth.admin.createUser({
    email: syntheticEmail,
    password: throwawayPassword,
    email_confirm: true,
  });
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

  const pin_hash = await hashPin(fd.pin);
  const { error: insertError } = await serviceClient.from("user_roles").insert({
    email: syntheticEmail,
    phone: mobile,
    role: fd.role,
    custom_permissions: fd.custom || {},
    pin_hash,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await logAction(supabase, user.email, `Phone login created: ${mobile} → ${fd.role}`);
  return NextResponse.json({ ok: true, email: syntheticEmail });
}
