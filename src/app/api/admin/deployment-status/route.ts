import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";

/** Same owner-email check as the middleware's isSuperAdminEmail (src/lib/supabase/session.ts)
 *  and set_module_entitlements' SQL check — duplicated rather than shared since one is a Next
 *  middleware helper and the other lives in Postgres; this is the third, server-route copy. */
function isSuperAdminEmail(email: string | undefined): boolean {
  const ownerEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
  return !!ownerEmail && !!email && email.toLowerCase() === ownerEmail.toLowerCase();
}

/**
 * Reports only WHETHER a handful of server-only env vars are configured on this deployment —
 * never their values — so the Admin Console can show a "not wired up yet" flag for things like
 * the Razorpay webhook without exposing any secret to the browser. Platform-owner only, same
 * as every other admin-console/module-licensing style route.
 */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSuperAdminEmail(user.email)) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  return NextResponse.json({
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasRazorpayWebhookSecret: !!process.env.RAZORPAY_WEBHOOK_SECRET,
    hasAttendanceSessionSecret: !!process.env.ATTENDANCE_SESSION_SECRET,
    selfSignupEnabled: process.env.NEXT_PUBLIC_ENABLE_SELF_SIGNUP === "true",
  });
}
