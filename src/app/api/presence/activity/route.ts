import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const WINDOW_HOURS = 12;

/** Hourly login-activity buckets for the "Who's online" sparkline (dashboard card + Settings >
 *  Users & Access) — one point per hour for the last 12 hours, counting every login_events row
 *  (portal + checkin) that landed in that hour. Admin-only, same reasoning as /api/presence/live.
 *  Bucketed here (not via a Postgres aggregate) since login_events is small enough that fetching
 *  the window's raw rows and grouping in JS is simpler than a bespoke RPC for one sparkline. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_HOURS * 60 * 60_000);
  const { data } = await serviceClient.from("login_events").select("occurred_at").gte("occurred_at", windowStart.toISOString());

  // One bucket per hour boundary, oldest first, so the sparkline reads left-to-right as "earlier
  // -> now" — each event falls into the bucket for the hour it started in.
  const buckets: { hour: string; count: number }[] = [];
  for (let i = WINDOW_HOURS - 1; i >= 0; i--) {
    const bucketStart = new Date(now.getTime() - i * 60 * 60_000);
    bucketStart.setMinutes(0, 0, 0);
    buckets.push({ hour: bucketStart.toLocaleTimeString("en-IN", { hour: "numeric", hour12: true }), count: 0 });
  }

  for (const row of data || []) {
    const t = new Date(row.occurred_at).getTime();
    const hoursAgo = Math.floor((now.getTime() - t) / (60 * 60_000));
    const idx = WINDOW_HOURS - 1 - hoursAgo;
    if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1;
  }

  return NextResponse.json({ buckets });
}
