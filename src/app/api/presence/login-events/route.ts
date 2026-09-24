import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const HISTORY_LIMIT = 50;

/** Recent-logins history table for Settings > Users & Access. Admin-only, same reasoning as
 *  /api/presence/live. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });

  const { data } = await serviceClient
    .from("login_events")
    .select("id, occurred_at, login_type, method, display_name, role")
    .order("occurred_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const events = (data || []).map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at,
    loginType: r.login_type,
    method: r.method,
    displayName: r.display_name,
    role: r.role,
  }));

  return NextResponse.json({ events });
}
