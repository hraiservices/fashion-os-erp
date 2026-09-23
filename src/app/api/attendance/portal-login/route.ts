import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { signAttendanceToken, isAttendanceConfigured, ATTENDANCE_COOKIE_NAME, ATTENDANCE_COOKIE_MAX_AGE } from "@/lib/attendance-auth";

/**
 * Silent attendance login for a portal user (normal Supabase Auth session) whose login is
 * linked to an employee record (user_roles.linked_employee_id — same link Settings -> Users
 * already offers for "My Payslips" etc.). Lets /checkin skip the separate mobile+PIN screen for
 * anyone who's already logged into the main app and linked, without weakening the PIN-only path
 * for shop-floor employees who have no portal account (see attendance-auth.ts's trust-boundary
 * comment — this route still only ever produces the same narrow attendance-session cookie, it
 * just authenticates its holder a different way).
 */
export async function POST() {
  if (!isAttendanceConfigured()) return NextResponse.json({ error: "Attendance login is not configured" }, { status: 503 });

  const { user } = await getServerUser();
  if (!user?.employeeId) return NextResponse.json({ error: "Not linked to an employee record" }, { status: 404 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance login is not configured" }, { status: 503 });

  const { data: employee } = await supabase.from("employees").select("id, name, active").eq("id", user.employeeId).maybeSingle();
  if (!employee || !employee.active) return NextResponse.json({ error: "Employee not found or inactive" }, { status: 404 });

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
