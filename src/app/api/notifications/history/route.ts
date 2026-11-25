import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { fetchVisibleNotifications, fetchReadIds } from "@/lib/notifications-server";

/**
 * Everything this user may see, read or not — the bell itself only ever shows unread (capped at
 * 40); once something is dismissed there was previously no way to look it up again ("did I
 * already see that leave request?"). This is a plain read-only log of the last 100, each
 * annotated with whether THIS user has read it.
 */
export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const isAdminOrManager = user.role === "admin" || user.role === "manager";
  try {
    const recent = await fetchVisibleNotifications(supabase, user.email, isAdminOrManager, 100);
    const readIds = await fetchReadIds(supabase, user.email, recent.map((n) => n.id));
    const notifications = recent.map((n) => ({ ...n, isRead: readIds.has(n.id) }));
    return NextResponse.json({ notifications });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load notification history" }, { status: 500 });
  }
}
