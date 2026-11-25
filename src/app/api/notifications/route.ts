import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { fetchVisibleNotifications, fetchReadIds } from "@/lib/notifications-server";

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
 *
 * H-2: "unread" used to be a single shared `read` column — one person dismissing a notification
 * hid it from every other user too. Unread is now per-user (notification_reads;
 * supabase/migrations/add_notification_per_user_state.sql): fetch the recent rows this role may
 * see at all, then exclude whichever ones THIS user has already read, instead of relying on a
 * flag anyone could have already flipped.
 */
export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const isAdminOrManager = user.role === "admin" || user.role === "manager";

  try {
    // Over-fetch a bit past the 40 we'll actually show, since some of these will turn out to
    // already be read by this user and get filtered out below.
    const recent = await fetchVisibleNotifications(supabase, user.email, isAdminOrManager, 100);
    const readIds = await fetchReadIds(supabase, user.email, recent.map((n) => n.id));
    const unread = recent.filter((n) => !readIds.has(n.id)).slice(0, 40);
    return NextResponse.json({ notifications: unread });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load notifications" }, { status: 500 });
  }
}
