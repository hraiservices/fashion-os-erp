import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";
import { createServiceClient } from "@/lib/supabase/service";
import { touchPresence, resolvePortalDisplayName } from "@/lib/presence";

/**
 * Pinged every ~30s by a mounted tab (see use-presence.ts's usePresenceHeartbeat) to keep that
 * subject's user_presence.last_seen fresh — the only way "LIVE" (Settings > Users & Access +
 * the dashboard card) means anything more than "logged in once, ages ago".
 *
 * Portal identity takes priority over an attendance-session cookie: a linked employee who's
 * auto-bridged into /checkin (see /api/attendance/portal-login) still has a real portal session
 * too, and counting them once as "portal" rather than twice (portal AND checkin) is what keeps
 * the live list one row per person, not one row per open tab type.
 */
export async function POST() {
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ ok: false }, { status: 503 });

  const { user } = await getServerUser();
  if (user) {
    await touchPresence(serviceClient, {
      loginType: "portal",
      // Portal login method isn't tracked per-request here — heartbeats just refresh
      // last_seen, and the method column keeps whatever recordLogin() set at sign-in time
      // (upsert only touches the row that already exists in the common case).
      method: "email",
      email: user.email,
      employeeId: user.employeeId,
      displayName: await resolvePortalDisplayName(serviceClient, user.email, user.employeeId),
      role: user.role,
    });
    return NextResponse.json({ ok: true });
  }

  const employeeId = await getAttendanceEmployeeId();
  if (employeeId) {
    const { data: employee } = await serviceClient.from("employees").select("name, role").eq("id", employeeId).maybeSingle();
    if (employee) {
      await touchPresence(serviceClient, {
        loginType: "checkin",
        method: "pin",
        employeeId,
        displayName: employee.name,
        role: employee.role,
      });
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
