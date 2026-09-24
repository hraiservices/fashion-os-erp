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
  const { data: liveRows } = await serviceClient
    .from("user_presence")
    .select("subject_key, login_type, method, display_name, role, last_seen")
    .gte("last_seen", cutoff)
    .order("last_seen", { ascending: false });

  const live = (liveRows || []).map((r) => ({
    subjectKey: r.subject_key,
    loginType: r.login_type,
    method: r.method,
    displayName: r.display_name,
    role: r.role,
    lastSeen: r.last_seen,
  }));

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
