import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** logAction()/client.db.addLog, used throughout the old app to write activity_log rows. */
export async function logAction(
  supabase: SupabaseClient<Database>,
  userEmail: string | null | undefined,
  action: string,
  orderId?: string | null,
  details?: string | null
): Promise<void> {
  const userName = (userEmail || "").split("@")[0] || "user";
  await supabase.from("activity_log").insert({
    user_email: userEmail || null,
    user_name: userName,
    action,
    order_id: orderId || null,
    details: details || null,
  });
}

/** sendAdminNotification(), line ~16385. */
export async function sendAdminNotification(
  supabase: SupabaseClient<Database>,
  userEmail: string | null | undefined,
  params: { orderId: string; customerName: string; fromStage: string; toStage: string }
): Promise<void> {
  const uEmail = userEmail || "unknown";
  const uName = uEmail.split("@")[0] || "user";
  const message = `${uName} changed ${params.customerName} (${params.orderId}) from ${params.fromStage} → ${params.toStage}`;
  await supabase.from("admin_notifications").insert({
    type: "stage_change",
    order_id: params.orderId,
    customer_name: params.customerName,
    from_stage: params.fromStage,
    to_stage: params.toStage,
    user_email: uEmail,
    user_name: uName,
    message,
    read: false,
  });
}
