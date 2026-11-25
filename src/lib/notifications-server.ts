import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { categoryOf } from "@/lib/notification-alerts";

const NOTIFICATION_COLUMNS = "id, type, order_id, employee_id, customer_name, from_stage, to_stage, user_name, message, created_at";

export interface NotificationRow {
  id: number;
  type: string;
  order_id: string | null;
  employee_id: string | null;
  customer_name: string | null;
  from_stage: string | null;
  to_stage: string | null;
  user_name: string | null;
  message: string | null;
  created_at: string;
}

/**
 * Shared by /api/notifications (the bell: unread only) and /api/notifications/history (everything,
 * read or not). Role visibility (visibleToRole in notification-alerts.ts governs the UI's own
 * per-type rendering, but a non-admin/manager role only ever gets stage_change rows at all — same
 * restriction the bell route always applied) and per-category mutes both happen here, once.
 */
export async function fetchVisibleNotifications(
  supabase: SupabaseClient<Database>,
  userEmail: string,
  isAdminOrManager: boolean,
  limit: number
): Promise<NotificationRow[]> {
  const { data: mutes } = await supabase.from("notification_mutes").select("category").eq("user_email", userEmail);
  const mutedCategories = new Set((mutes || []).map((m) => m.category));

  let query = supabase
    .from("admin_notifications")
    .select(NOTIFICATION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!isAdminOrManager) query = query.eq("type", "stage_change");

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter((n) => !mutedCategories.has(categoryOf(n.type)));
}

/** This user's own read notification ids, among the given ids — used to compute "unread for me". */
export async function fetchReadIds(supabase: SupabaseClient<Database>, userEmail: string, notificationIds: number[]): Promise<Set<number>> {
  if (notificationIds.length === 0) return new Set();
  const { data, error } = await supabase.from("notification_reads").select("notification_id").eq("user_email", userEmail).in("notification_id", notificationIds);
  if (error) throw error;
  return new Set((data || []).map((r) => r.notification_id));
}
