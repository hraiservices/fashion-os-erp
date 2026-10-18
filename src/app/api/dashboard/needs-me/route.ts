import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { buildBriefingSummary } from "@/lib/ai-briefing";
import { buildNeedsMe } from "@/lib/needs-me";
import { isRestrictedRole } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/service";

/** GET — the dashboard's "What needs me today" list, from the same numbers as the morning briefing. Managers and owners only. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (isRestrictedRole(user.role)) return NextResponse.json({ error: "Not available for your role" }, { status: 403 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });

  const [summary, ready] = await Promise.all([buildBriefingSummary(serviceClient), serviceClient.from("orders").select("id", { count: "exact", head: true }).eq("status", "ready")]);
  return NextResponse.json({ date: summary.date, items: buildNeedsMe(summary, ready.count ?? 0, !!user.perms.accessTargets) });
}
