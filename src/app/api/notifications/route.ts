import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";

/**
 * Notifications were previously read straight from the browser client with no role filter at
 * all — `admin_notifications` RLS is permissive like most tables here, and the bell only
 * decided WHICH rows to render client-side (ai_briefing / leave_request / attendance are
 * admin+manager-only in notification-bell.tsx). That meant every role's browser still received
 * the full row set over the network and into the React Query cache — a sales or tailor account
 * could see AI-briefing messages (overdue balances, cash collected) and leave/attendance
 * notifications naming employees, just by opening DevTools, even though the UI never rendered
 * them. Filtering now happens here, server-side, before the data ever reaches a non-admin/
 * manager browser.
 */
export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const isAdminOrManager = user.role === "admin" || user.role === "manager";

  let query = supabase
    .from("admin_notifications")
    .select("id, type, order_id, employee_id, customer_name, from_stage, to_stage, user_name, message, created_at")
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(40);

  if (!isAdminOrManager) {
    query = query.eq("type", "stage_change");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data || [] });
}
