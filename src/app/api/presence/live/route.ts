import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { LIVE_WINDOW_MS } from "@/lib/presence";

/** Feeds both the dashboard card and the Settings > Users & Access "Live now" section.
 *  Admin-only by literal role check (like the Documents & KYC section) — this is presence data
 *  about every user in the shop, not something a manager/sales/tailor role should see. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });

  const cutoff = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
  const [{ data: liveRows }, { data: openShiftRows }] = await Promise.all([
    serviceClient
      .from("user_presence")
      .select("subject_key, login_type, method, display_name, role, last_seen")
      .gte("last_seen", cutoff)
      .order("last_seen", { ascending: false }),
    // A shop-floor employee who checked in via the PIN kiosk almost never keeps that browser
    // tab open all day (they walk away to work), so their heartbeat-based presence expires
    // after ~2 minutes even though they're still on shift — see the "Check-in (0)" bug this
    // fixes. Anyone with an open attendance shift (checked in, not yet checked out) counts as
    // live for the whole shift instead, regardless of heartbeat freshness.
    serviceClient
      .from("employee_attendance")
      .select("employee_id, check_in_at, employees:employee_id(name, role)")
      .not("check_in_at", "is", null)
      .is("check_out_at", null),
  ]);

  const live = (liveRows || []).map((r) => ({
    subjectKey: r.subject_key,
    loginType: r.login_type,
    method: r.method,
    displayName: r.display_name,
    role: r.role,
    lastSeen: r.last_seen,
  }));

  const liveSubjectKeys = new Set(live.map((r) => r.subjectKey));
  for (const shift of openShiftRows || []) {
    const key = `checkin:${shift.employee_id}`;
    if (liveSubjectKeys.has(key)) continue; // already live via a fresh heartbeat — don't double-count
    const employee = shift.employees as unknown as { name: string; role: string | null } | null;
    live.push({
      subjectKey: key,
      loginType: "checkin",
      method: "pin",
      displayName: employee?.name || "Employee",
      role: employee?.role || null,
      lastSeen: shift.check_in_at as string,
    });
  }
  live.sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""));

  let lastLogin: { displayName: string; occurredAt: string } | null = null;
  if (live.length === 0) {
    const { data: lastEvent } = await serviceClient
      .from("login_events")
      .select("display_name, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastEvent) lastLogin = { displayName: lastEvent.display_name, occurredAt: lastEvent.occurred_at };
  }

  return NextResponse.json({ live, lastLogin });
}
