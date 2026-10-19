import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Same pattern as DASHBOARD_ACCESS_EMAIL_RE in day-book.ts, kept local so server logging does not pull in that UI module. */
const DASHBOARD_ACCESS_EMAIL_RE = /^emp-(.+)@dashboard\.local$/i;

/** Any login linked to an employee record (user_roles.linked_employee_id) — whether provisioned
 *  with a synthetic `emp-<id>@dashboard.local` dashboard-access email, or logged in with the
 *  employee's own real email — should show that employee's real name, not
 *  `user.email.split("@")[0]` (the convention used elsewhere to derive a display name, which
 *  only happens to work for a synthetic email; for a real email it shows a misleading fragment
 *  like "connect" instead of the person's name). Mirrors resolvePortalDisplayName() in
 *  lib/presence.ts, which gates on employeeId alone for the same reason. Call this wherever an
 *  order route is about to log/notify with the acting user's name (history lines, activity_log,
 *  admin_notifications). */
export async function resolveActingUserName(
  supabase: SupabaseClient<Database>,
  user: { email: string; employeeId?: string | null }
): Promise<string> {
  if (user.employeeId) {
    const { data } = await supabase.from("employees").select("name").eq("id", user.employeeId).maybeSingle();
    if (data?.name) return data.name;
  }
  return nameFromEmail(supabase, user.email);
}

/** The display name for a stored login email: a dashboard-access `emp-<id>@dashboard.local` address is looked up in the
 *  employees table, anything else uses the local part. Never returns the raw employee id. */
export async function nameFromEmail(supabase: SupabaseClient<Database>, email: string | null | undefined): Promise<string> {
  const local = (email || "").split("@")[0] || "user";
  const m = (email || "").match(DASHBOARD_ACCESS_EMAIL_RE);
  if (!m) return local;
  const { data } = await supabase.from("employees").select("name").eq("id", m[1]).maybeSingle();
  return data?.name || "Staff";
}

/**
 * logAction()/client.db.addLog, used throughout the old app to write activity_log rows.
 *
 * Returns whether the insert actually succeeded, instead of the `Promise<void>` this used to be
 * — every one of the ~140 existing `await logAction(...)` call sites that don't look at the
 * return value keeps working exactly as before. The reason to add it: the insert's own error was
 * previously discarded outright (not even checked, just dropped), so a failed write here was
 * completely invisible — no console line, no thrown error, nothing. For most callers that's a
 * missed line in an audit trail nobody was going to read anyway. But for a "Stage changed: X → Y"
 * line specifically, this IS the data: it's the only record a stage transition ever happened,
 * and the Day Book's per-tailor payable report (buildTailorStageProgress in day-book.ts) is built
 * entirely by reading these lines back. A silent failure right here means the order still
 * advances normally — the status update is a separate, successful RPC call — while the tailor who
 * did that work never gets credited for it, with nothing in the UI to say why. See set-stage and
 * advance-stage routes, which now check this and raise a visible warning when it happens.
 */
export async function logAction(
  supabase: SupabaseClient<Database>,
  userEmail: string | null | undefined,
  action: string,
  orderId?: string | null,
  details?: string | null
): Promise<boolean> {
  const userName = await nameFromEmail(supabase, userEmail);
  const { error } = await supabase.from("activity_log").insert({
    user_email: userEmail || null,
    user_name: userName,
    action,
    order_id: orderId || null,
    details: details || null,
  });
  if (error) {
    // Surfaced at minimum, even for callers that don't check the return value — previously this
    // vanished completely, with no trace anywhere that the write was ever attempted.
    console.error(`[logAction] activity_log insert failed for order ${orderId ?? "(none)"}: ${action}`, error);
    return false;
  }
  return true;
}

/** sendAdminNotification(), line ~16385. `note` appends a short flag to the message — used for
 *  the "this tailor's own piece-rate payable was auto-confirmed on their own stage change"
 *  case, so a manager reviewing notifications sees it without a separate notification type.
 *  Pass `resolvedUserName` (from resolveActingUserName()) when the caller already has it, so a
 *  dashboard-access tailor's name is used instead of the raw employee id baked into their
 *  synthetic email — this is baked directly into `message`, so it can't be fixed after the fact. */
export async function sendAdminNotification(
  supabase: SupabaseClient<Database>,
  userEmail: string | null | undefined,
  params: { orderId: string; customerName: string; fromStage: string; toStage: string; note?: string },
  resolvedUserName?: string
): Promise<void> {
  const uEmail = userEmail || "unknown";
  const uName = resolvedUserName || (await nameFromEmail(supabase, uEmail));
  const message = `${uName} changed ${params.customerName} (${params.orderId}) from ${params.fromStage} → ${params.toStage}${params.note ? ` — ${params.note}` : ""}`;
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

/** A payment was recorded — a critical alert for admins/managers (not for whoever recorded it, who knows). `orderId` is
 *  absent for an invoice payment. */
export async function notifyPaymentReceived(
  supabase: SupabaseClient<Database>,
  params: { userEmail: string; userName?: string; amount: number; customerName?: string; orderId?: string; invoiceNumber?: string }
): Promise<void> {
  const what = params.orderId ? `order ${params.orderId}` : params.invoiceNumber ? `invoice ${params.invoiceNumber}` : "a sale";
  const message = `₹${Math.round(params.amount).toLocaleString("en-IN")} received${params.customerName ? ` from ${params.customerName}` : ""} for ${what}`;
  await supabase.from("admin_notifications").insert({
    type: "payment_received",
    order_id: params.orderId ?? null,
    customer_name: params.customerName ?? null,
    user_email: params.userEmail,
    user_name: params.userName ?? params.userEmail.split("@")[0],
    message,
    read: false,
  });
}
