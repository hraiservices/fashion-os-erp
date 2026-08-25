import { Receipt, Banknote, Wallet, Truck, Scissors, Users, Clock, UserCog, Activity, type LucideIcon } from "lucide-react";
import { deriveBalance, STAGE_META, type Stage } from "@/lib/business-rules";

/**
 * Day Book: a single-date, cross-module activity feed. Every entry is built either straight
 * from a source-of-truth table (real amount/date/created_by columns — sales, payments,
 * expenses, purchases, attendance, payroll, leave) or, where no such table exists, from
 * `activity_log`'s own real `created_at` timestamp with its free-text `action` shown as-is
 * (stitching-order edits/stage-changes, customer updates) — see the two "FROM SOURCE TABLE"
 * vs "FROM ACTIVITY LOG" comment blocks in each builder below. Financial reconciliation totals
 * (src/app/api/reports/day-book/route.ts) are computed only from source-table amounts, never
 * from activity_log text, so they can't drift from what the rest of the app reports.
 */

export type DayBookModule = "sales" | "payments" | "expenses" | "purchases" | "stitching" | "customers" | "attendance" | "payroll" | "other";

export const DAY_BOOK_MODULE_LABELS: Record<DayBookModule, string> = {
  sales: "Sales",
  payments: "Payments",
  expenses: "Expenses",
  purchases: "Purchases",
  stitching: "Stitching",
  customers: "Customers",
  attendance: "Attendance",
  payroll: "Payroll",
  other: "Other",
};

export const DAY_BOOK_MODULE_ICONS: Record<DayBookModule, LucideIcon> = {
  sales: Receipt,
  payments: Banknote,
  expenses: Wallet,
  purchases: Truck,
  stitching: Scissors,
  customers: Users,
  attendance: Clock,
  payroll: UserCog,
  other: Activity,
};

export interface DayBookEntry {
  id: string;
  time: string; // ISO timestamp
  module: DayBookModule;
  activity: string; // short label, e.g. "Invoice Created"
  description: string; // human-readable line
  reference?: string; // e.g. INV-1042, ORD-204
  referenceHref?: string; // drill-down link, respects the target page's own permission guard
  amount?: number;
  customer?: string;
  vendor?: string;
  employee?: string;
  user: string; // display name
  userEmail?: string;
}

/** The only "name" data this schema has for a user is their email — see AGENTS this session's
 *  audit: no display_name column exists anywhere. Matches the convention already duplicated
 *  across ~7 call sites in src/lib/logging.ts and the order-stage routes. */
export function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) return "System";
  const local = email.split("@")[0];
  return local || email;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

export { fmtTime };

// ── Sales ────────────────────────────────────────────────────────────────

interface SalesInvoiceRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_mobile: string;
  total: number;
  doc_status: string;
  created_by: string | null;
  created_at: string;
}

export function buildSalesInvoiceEntries(rows: SalesInvoiceRow[]): DayBookEntry[] {
  return rows.map((r) => ({
    id: `inv-${r.id}`,
    time: r.created_at,
    module: "sales",
    activity: r.doc_status === "draft" ? "Invoice Saved as Draft" : "Invoice Created",
    description: `${r.invoice_number} for ${r.customer_name}`,
    reference: r.invoice_number,
    referenceHref: `/sales/invoices/${r.id}`,
    amount: r.total,
    customer: r.customer_name,
    user: displayNameFromEmail(r.created_by),
    userEmail: r.created_by || undefined,
  }));
}

interface SalesPaymentRow {
  id: string;
  invoice_id: string;
  customer_mobile: string;
  amount: number;
  method: string;
  created_by: string | null;
  created_at: string;
}

export function buildSalesPaymentEntries(rows: SalesPaymentRow[], invoiceByIdMap: Map<string, { invoiceNumber: string; customerName: string }>): DayBookEntry[] {
  return rows.map((r) => {
    const inv = invoiceByIdMap.get(r.invoice_id);
    return {
      id: `salespay-${r.id}`,
      time: r.created_at,
      module: "payments",
      activity: "Payment Received",
      description: `₹${r.amount} via ${r.method}${inv ? ` for ${inv.invoiceNumber}` : ""}`,
      reference: inv?.invoiceNumber,
      referenceHref: inv ? `/sales/invoices/${r.invoice_id}` : undefined,
      amount: r.amount,
      customer: inv?.customerName,
      user: displayNameFromEmail(r.created_by),
      userEmail: r.created_by || undefined,
    };
  });
}

interface SalesCreditNoteRow {
  id: string;
  credit_number: string;
  invoice_id: string;
  total: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export function buildSalesCreditNoteEntries(rows: SalesCreditNoteRow[], invoiceByIdMap: Map<string, { invoiceNumber: string; customerName: string }>): DayBookEntry[] {
  return rows.map((r) => {
    const inv = invoiceByIdMap.get(r.invoice_id);
    return {
      id: `scn-${r.id}`,
      time: r.created_at,
      module: "sales",
      activity: "Refund / Credit Note",
      description: `${r.credit_number} — ₹${r.total}${r.reason ? ` (${r.reason})` : ""}${inv ? ` against ${inv.invoiceNumber}` : ""}`,
      reference: r.credit_number,
      referenceHref: inv ? `/sales/invoices/${r.invoice_id}` : undefined,
      amount: r.total,
      customer: inv?.customerName,
      user: displayNameFromEmail(r.created_by),
      userEmail: r.created_by || undefined,
    };
  });
}

// ── Expenses ─────────────────────────────────────────────────────────────

interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: number;
  pay_method: string;
  created_by: string | null;
  created_at: string;
}

export function buildExpenseEntries(rows: ExpenseRow[]): DayBookEntry[] {
  return rows.map((r) => ({
    id: `exp-${r.id}`,
    time: r.created_at,
    module: "expenses",
    activity: "Expense Recorded",
    description: `${r.category}${r.description ? ` — ${r.description}` : ""} via ${r.pay_method}`,
    reference: r.id.slice(0, 8).toUpperCase(),
    amount: r.amount,
    user: displayNameFromEmail(r.created_by),
    userEmail: r.created_by || undefined,
  }));
}

// ── Purchases ────────────────────────────────────────────────────────────

interface PurchaseBillRow {
  id: string;
  bill_number: string;
  vendor_id: string;
  total: number;
  created_by: string | null;
  created_at: string;
}

export function buildPurchaseBillEntries(rows: PurchaseBillRow[], vendorByIdMap: Map<string, string>): DayBookEntry[] {
  return rows.map((r) => ({
    id: `bill-${r.id}`,
    time: r.created_at,
    module: "purchases",
    activity: "Purchase Bill Created",
    description: `${r.bill_number} from ${vendorByIdMap.get(r.vendor_id) || "vendor"}`,
    reference: r.bill_number,
    referenceHref: `/purchases/bills/${r.id}`,
    amount: r.total,
    vendor: vendorByIdMap.get(r.vendor_id),
    user: displayNameFromEmail(r.created_by),
    userEmail: r.created_by || undefined,
  }));
}

interface VendorPaymentRow {
  id: string;
  bill_id: string;
  vendor_id: string;
  amount: number;
  method: string;
  created_by: string | null;
  created_at: string;
}

export function buildVendorPaymentEntries(rows: VendorPaymentRow[], vendorByIdMap: Map<string, string>, billByIdMap: Map<string, string>): DayBookEntry[] {
  return rows.map((r) => ({
    id: `vpay-${r.id}`,
    time: r.created_at,
    module: "purchases",
    activity: "Payment to Vendor",
    description: `₹${r.amount} via ${r.method} to ${vendorByIdMap.get(r.vendor_id) || "vendor"}${billByIdMap.get(r.bill_id) ? ` for ${billByIdMap.get(r.bill_id)}` : ""}`,
    reference: billByIdMap.get(r.bill_id),
    referenceHref: `/purchases/bills/${r.bill_id}`,
    amount: r.amount,
    vendor: vendorByIdMap.get(r.vendor_id),
    user: displayNameFromEmail(r.created_by),
    userEmail: r.created_by || undefined,
  }));
}

interface VendorCreditRow {
  id: string;
  credit_number: string;
  vendor_id: string;
  bill_id: string | null;
  total: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export function buildVendorCreditEntries(rows: VendorCreditRow[], vendorByIdMap: Map<string, string>): DayBookEntry[] {
  return rows.map((r) => ({
    id: `vc-${r.id}`,
    time: r.created_at,
    module: "purchases",
    activity: "Vendor Credit / Return",
    description: `${r.credit_number} — ₹${r.total}${r.reason ? ` (${r.reason})` : ""} from ${vendorByIdMap.get(r.vendor_id) || "vendor"}`,
    reference: r.credit_number,
    referenceHref: r.bill_id ? `/purchases/bills/${r.bill_id}` : undefined,
    amount: r.total,
    vendor: vendorByIdMap.get(r.vendor_id),
    user: displayNameFromEmail(r.created_by),
    userEmail: r.created_by || undefined,
  }));
}

// ── Stitching orders ─────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  name: string;
  mobile: string;
  total: number;
  advance: number;
  status: string;
  created_at: string;
}

export function buildOrderCreatedEntries(rows: OrderRow[], creatorByOrderId: Map<string, string | null>): DayBookEntry[] {
  return rows.map((r) => {
    const creator = creatorByOrderId.get(r.id) ?? null;
    return {
      id: `ord-${r.id}`,
      time: r.created_at,
      module: "stitching",
      activity: "Order Created",
      description: `${r.id} for ${r.name} — ${STAGE_META[r.status as Stage]?.label || r.status}`,
      reference: r.id,
      referenceHref: `/orders/${r.id}`,
      amount: r.total,
      customer: r.name,
      user: displayNameFromEmail(creator),
      userEmail: creator || undefined,
    };
  });
}

/** activity_log is the only source with a real timestamp for order edits, deletes, and stage
 *  changes — orders.history entries carry no queryable timestamp column, only a formatted
 *  string. Order-payment amounts are extracted from the exact `logAction` template the payment
 *  route writes (`💰 Payment ₹X via Y...`, src/app/api/orders/[id]/payment/route.ts) — there is
 *  no separate structured order-payments table in this schema (a known, documented limitation,
 *  not something invented here), so this is a best-effort text extraction against a template
 *  this codebase controls, not a guess. */
interface ActivityLogRow {
  id: number;
  user_email: string | null;
  user_name: string | null;
  action: string;
  order_id: string | null;
  details: string | null;
  created_at: string;
}

export const ORDER_PAYMENT_RE = /^💰 Payment ₹([\d.]+)/;
// Matches ORDER_PAYMENT_METHODS (src/lib/business-rules.ts) — "Bank Transfer" has a space, so
// this can't just split on whitespace; anchoring on the known method list is exact and simple.
export const ORDER_PAYMENT_METHOD_RE = /^💰 Payment ₹[\d.]+ via (Cash|UPI|Card|Bank Transfer)/;
const STAGE_CHANGE_RE = /Stage changed: (.+?) for (.+)$/;

/** Extracts {amount, method} pairs from activity_log rows for stitching-order payments — the
 *  same rows buildOrderActivityLogEntries turns into "Payment Collected" timeline entries, so a
 *  report built from this can never disagree with what Day Book shows for the same date range.
 *  A row created before the "via {method}" text was added to the action template (or a payment
 *  method the regex doesn't recognize) yields method "Other" rather than being dropped, so old
 *  data still counts toward the total even though its method can't be attributed. */
export function extractOrderPayments(rows: Pick<ActivityLogRow, "action">[]): { amount: number; method: string }[] {
  return rows
    .filter((r) => r.action.startsWith("💰 Payment ₹"))
    .map((r) => ({
      amount: Number(r.action.match(ORDER_PAYMENT_RE)?.[1]) || 0,
      method: r.action.match(ORDER_PAYMENT_METHOD_RE)?.[1] || "Other",
    }));
}

export function buildOrderActivityLogEntries(rows: ActivityLogRow[]): DayBookEntry[] {
  const out: DayBookEntry[] = [];
  for (const r of rows) {
    if (!r.order_id) continue;
    const user = r.user_name || displayNameFromEmail(r.user_email);
    const base = { id: `al-${r.id}`, time: r.created_at, reference: r.order_id, referenceHref: `/orders/${r.order_id}`, user, userEmail: r.user_email || undefined };
    if (r.action.startsWith("💰 Payment ₹")) {
      const m = r.action.match(ORDER_PAYMENT_RE);
      out.push({ ...base, module: "stitching", activity: "Payment Collected", description: r.action, amount: m ? Number(m[1]) : undefined });
    } else if (r.action.includes("Stage changed")) {
      const m = r.action.match(STAGE_CHANGE_RE);
      out.push({ ...base, module: "stitching", activity: "Stage Changed", description: m ? `${m[1]} — ${m[2]}` : r.action });
    } else if (r.action.startsWith("✏️ Order edited")) {
      out.push({ ...base, module: "stitching", activity: "Order Edited", description: r.action });
    } else if (r.action.startsWith("🗑️ Order deleted")) {
      out.push({ ...base, module: "stitching", activity: "Order Deleted", description: r.action, referenceHref: undefined });
    } else if (r.action.startsWith("📋 New order")) {
      // Covered by buildOrderCreatedEntries (clean orders.created_at) — skip to avoid a duplicate row.
      continue;
    } else {
      out.push({ ...base, module: "stitching", activity: "Order Updated", description: r.action });
    }
  }
  return out;
}

// ── Customers ────────────────────────────────────────────────────────────

interface CustomerRow {
  id: string;
  name: string;
  mobile: string;
  created_at: string;
}

export function buildCustomerCreatedEntries(rows: CustomerRow[]): DayBookEntry[] {
  return rows.map((r) => ({
    id: `cust-${r.id}`,
    time: r.created_at,
    module: "customers",
    activity: "Customer Added",
    description: `${r.name} (${r.mobile})`,
    reference: r.mobile,
    referenceHref: `/crm/${r.mobile}`,
    customer: r.name,
    user: "—",
  }));
}

export function buildCustomerActivityLogEntries(rows: ActivityLogRow[]): DayBookEntry[] {
  const out: DayBookEntry[] = [];
  for (const r of rows) {
    const user = r.user_name || displayNameFromEmail(r.user_email);
    if (r.action.startsWith("✏️ Customer profile updated")) {
      out.push({ id: `al-${r.id}`, time: r.created_at, module: "customers", activity: "Customer Updated", description: r.action, user, userEmail: r.user_email || undefined });
    } else if (r.action.startsWith("🗑️ Customer deleted")) {
      out.push({ id: `al-${r.id}`, time: r.created_at, module: "customers", activity: "Customer Deleted", description: r.action, user, userEmail: r.user_email || undefined });
    }
  }
  return out;
}

// ── Attendance ───────────────────────────────────────────────────────────

interface AttendanceRow {
  id: string;
  employee_id: string;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  hours_worked: number | null;
  overtime_hours: number;
  created_by: string | null;
}

/** `dayStartUtc` is only used as the timestamp for a manually-marked row (no self-service
 *  check-in/out, so no real timestamp exists) — placed at the start of the selected day so it
 *  sorts before any real timed event that day rather than sorting first-of-all-time via an
 *  empty string. */
export function buildAttendanceEntries(rows: AttendanceRow[], employeeNameById: Map<string, string>, dayStartUtc: string): DayBookEntry[] {
  const out: DayBookEntry[] = [];
  for (const r of rows) {
    const name = employeeNameById.get(r.employee_id) || "Employee";
    if (r.check_in_at) {
      out.push({
        id: `att-in-${r.id}`,
        time: r.check_in_at,
        module: "attendance",
        activity: "Check-in",
        description: `${name} checked in`,
        employee: name,
        user: r.created_by ? displayNameFromEmail(r.created_by) : name,
      });
    }
    if (r.check_out_at) {
      out.push({
        id: `att-out-${r.id}`,
        time: r.check_out_at,
        module: "attendance",
        activity: "Check-out",
        description: `${name} checked out${r.hours_worked != null ? ` — ${r.hours_worked}h worked` : ""}${r.overtime_hours > 0 ? ` (+${r.overtime_hours}h OT)` : ""}`,
        employee: name,
        user: r.created_by ? displayNameFromEmail(r.created_by) : name,
      });
    }
    if (!r.check_in_at && !r.check_out_at) {
      // Manually marked (present/absent/leave/half-day) with no self-service timestamp.
      out.push({
        id: `att-mark-${r.id}`,
        time: dayStartUtc,
        module: "attendance",
        activity: "Attendance Marked",
        description: `${name} marked ${r.status}`,
        employee: name,
        user: displayNameFromEmail(r.created_by),
        userEmail: r.created_by || undefined,
      });
    }
  }
  return out;
}

// ── Leave ────────────────────────────────────────────────────────────────

interface LeaveRequestRow {
  id: string;
  employee_id: string;
  from_date: string;
  to_date: string;
  days: number;
  status: string;
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

export function buildLeaveAppliedEntries(rows: LeaveRequestRow[], employeeNameById: Map<string, string>): DayBookEntry[] {
  return rows.map((r) => ({
    id: `leave-apply-${r.id}`,
    time: r.requested_at,
    module: "attendance",
    activity: "Leave Applied",
    description: `${employeeNameById.get(r.employee_id) || "Employee"} applied for ${r.days} day(s) leave (${r.from_date} to ${r.to_date})`,
    employee: employeeNameById.get(r.employee_id),
    user: r.requested_by === "self-service" ? employeeNameById.get(r.employee_id) || "Employee" : displayNameFromEmail(r.requested_by),
  }));
}

export function buildLeaveDecidedEntries(rows: LeaveRequestRow[], employeeNameById: Map<string, string>): DayBookEntry[] {
  return rows
    .filter((r) => r.decided_at && (r.status === "approved" || r.status === "rejected"))
    .map((r) => ({
      id: `leave-decide-${r.id}`,
      time: r.decided_at!,
      module: "attendance",
      activity: r.status === "approved" ? "Leave Approved" : "Leave Rejected",
      description: `${employeeNameById.get(r.employee_id) || "Employee"}'s leave (${r.from_date} to ${r.to_date}) ${r.status}`,
      employee: employeeNameById.get(r.employee_id),
      user: displayNameFromEmail(r.decided_by),
      userEmail: r.decided_by || undefined,
    }));
}

// ── Payroll ──────────────────────────────────────────────────────────────

interface PayslipRow {
  id: string;
  employee_id: string;
  net_pay: number;
  status: string;
  paid_at: string | null;
}

export function buildPayslipPaidEntries(rows: PayslipRow[], employeeNameById: Map<string, string>): DayBookEntry[] {
  return rows
    .filter((r) => r.status === "paid" && r.paid_at)
    .map((r) => ({
      id: `payslip-${r.id}`,
      time: r.paid_at!,
      module: "payroll",
      activity: "Salary Paid",
      description: `Payslip settled for ${employeeNameById.get(r.employee_id) || "employee"}`,
      employee: employeeNameById.get(r.employee_id),
      referenceHref: `/employees/payroll`,
      amount: r.net_pay,
      user: "—",
    }));
}

interface EmployeeAdvanceRow {
  id: string;
  employee_id: string;
  amount: number;
  note: string;
  created_by: string | null;
  created_at: string;
}

export function buildAdvanceEntries(rows: EmployeeAdvanceRow[], employeeNameById: Map<string, string>): DayBookEntry[] {
  return rows.map((r) => ({
    id: `adv-${r.id}`,
    time: r.created_at,
    module: "payroll",
    activity: "Advance Given",
    description: `₹${r.amount} advance to ${employeeNameById.get(r.employee_id) || "employee"}${r.note ? ` — ${r.note}` : ""}`,
    employee: employeeNameById.get(r.employee_id),
    referenceHref: `/employees/${r.employee_id}`,
    amount: r.amount,
    user: displayNameFromEmail(r.created_by),
    userEmail: r.created_by || undefined,
  }));
}

// ── Other (work orders, users/settings, catch-all) ──────────────────────

export function buildOtherActivityLogEntries(rows: ActivityLogRow[]): DayBookEntry[] {
  return rows
    .filter((r) => !r.order_id) // order-linked rows are handled by buildOrderActivityLogEntries
    .filter((r) => !r.action.startsWith("✏️ Customer profile updated") && !r.action.startsWith("🗑️ Customer deleted"))
    .map((r) => ({
      id: `al-${r.id}`,
      time: r.created_at,
      module: "other" as DayBookModule,
      activity: r.action.replace(/^[\p{Emoji_Presentation}‍️]+\s*/gu, "").split(":")[0].slice(0, 40) || "Activity",
      description: r.details ? `${r.action} — ${r.details}` : r.action,
      user: r.user_name || displayNameFromEmail(r.user_email),
      userEmail: r.user_email || undefined,
    }));
}

export function sortEntries(entries: DayBookEntry[], order: "asc" | "desc"): DayBookEntry[] {
  const sorted = [...entries].sort((a, b) => a.time.localeCompare(b.time));
  return order === "desc" ? sorted.reverse() : sorted;
}
