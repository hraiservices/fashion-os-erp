import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchVisibleNotifications, fetchReadIds } from "@/lib/notifications-server";

/**
 * Marks every notification currently unread FOR THE CALLER as read — scoped to their own
 * notification_reads rows, so this is now safe for any role to use (previously "Clear all" was
 * admin/manager-only, because it flipped the single shared `read` column for every user at
 * once; a tailor or sales login had no way to clear their own bell at all).
 */
export async function POST() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const isAdminOrManager = user.role === "admin" || user.role === "manager";
  try {
    const recent = await fetchVisibleNotifications(supabase, user.email, isAdminOrManager, 200);
    const readIds = await fetchReadIds(supabase, user.email, recent.map((n) => n.id));
    const unreadIds = recent.filter((n) => !readIds.has(n.id)).map((n) => n.id);
    if (unreadIds.length > 0) {
      const { error } = await db.from("notification_reads").upsert(
        unreadIds.map((notification_id) => ({ notification_id, user_email: user.email })),
        { onConflict: "notification_id,user_email" }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cleared: unreadIds.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to clear notifications" }, { status: 500 });
  }
}
