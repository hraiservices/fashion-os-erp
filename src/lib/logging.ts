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

/** Notifies admins/managers when an employee submits a leave request via self-service — the
 *  one place a manager can't otherwise learn about it without opening the Leave page. Not sent
 *  for admin-recorded leave (src/app/api/leave-requests/route.ts) since the admin who typed it
 *  in obviously already knows. */
export async function notifyLeaveRequested(
  supabase: SupabaseClient<Database>,
  params: { employeeId: string; employeeName: string; fromDate: string; toDate: string; days: number }
): Promise<void> {
  const message = `${params.employeeName} applied for ${params.days} day${params.days === 1 ? "" : "s"} leave (${params.fromDate} to ${params.toDate})`;
  await supabase.from("admin_notifications").insert({
    type: "leave_request",
    employee_id: params.employeeId,
    user_name: params.employeeName,
    message,
    read: false,
  });
}

/** Notifies admins/managers every time an employee self-service checks in or out. */
export async function notifyAttendance(
  supabase: SupabaseClient<Database>,
  params: { employeeId: string; employeeName: string; action: "check-in" | "check-out"; hoursWorked?: number }
): Promise<void> {
  const message =
    params.action === "check-in"
      ? `${params.employeeName} checked in`
      : `${params.employeeName} checked out${params.hoursWorked != null ? ` — ${params.hoursWorked}h worked` : ""}`;
  await supabase.from("admin_notifications").insert({
    type: "attendance",
    employee_id: params.employeeId,
    user_name: params.employeeName,
    message,
    read: false,
  });
}
