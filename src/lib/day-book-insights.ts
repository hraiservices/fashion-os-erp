import { displayNameFromEmail, DAY_BOOK_MODULE_LABELS, fmtTime, type DayBookEntry, type DayBookModule } from "@/lib/day-book";
import { PAY_METHOD_LABELS, type CashPosition, type DayClosing, type MethodSplit, type PayMethodKey } from "@/lib/day-book-extras";

/**
 * Pure builders for the Day Book's second wave: attendance board, discount leakage, sold-today
 * breakdown, collections follow-up types, the accountant Excel pack and the one-line summary
 * used for WhatsApp templates. DB access stays in day-book-server.ts.
 */

// ── Cash adjustments ─────────────────────────────────────────────────────

export const ADJUSTMENT_REASONS = ["Bank deposit", "Owner withdrawal", "Salary paid in cash", "Float top-up", "Change / petty cash", "Other"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export interface CashAdjustment {
  id: string;
  date: string;
  kind: "in" | "out";
  amount: number;
  reason: string;
  note: string;
  createdBy: string | null;
  createdAt: string;
}

// ── Discount leakage ─────────────────────────────────────────────────────

/** A single invoice discounted by this much or more (of its gross value) gets flagged. */
export const DISCOUNT_FLAG_PCT = 20;

export interface DiscountByUser {
  user: string;
  amount: number;
  invoices: number;
}

export interface FlaggedDiscount {
  reference: string;
  href: string;
  user: string;
  pct: number;
  amount: number;
}

export interface DiscountSummary {
  total: number;
  byUser: DiscountByUser[];
  flagged: FlaggedDiscount[];
  /** Loyalty-point value redeemed against stitching orders — tracked apart from invoice discounts. */
  loyaltyRedeemed: number;
}

interface InvoiceForDiscount {
  id: string;
  invoice_number: string;
  doc_status: string;
  created_by: string | null;
  items: unknown;
  discount_type: string;
  discount_value: number;
}

interface LineItem {
  qty?: number;
  unitPrice?: number;
  amount?: number;
  productName?: string;
}

const asItems = (v: unknown): LineItem[] => (Array.isArray(v) ? (v as LineItem[]) : []);

/** Line-level discounts (list price × qty − line amount) plus the invoice-level discount. */
export function invoiceDiscount(inv: Pick<InvoiceForDiscount, "items" | "discount_type" | "discount_value">): { amount: number; gross: number } {
  const items = asItems(inv.items);
  const gross = items.reduce((s, i) => s + (i.qty || 0) * (i.unitPrice || 0), 0);
  const net = items.reduce((s, i) => s + (i.amount || 0), 0);
  const lineDiscount = Math.max(0, gross - net);
  const value = inv.discount_value || 0;
  const invoiceLevel = inv.discount_type === "percent" ? (net * Math.min(100, Math.max(0, value))) / 100 : Math.max(0, value);
  return { amount: Math.round((lineDiscount + invoiceLevel) * 100) / 100, gross };
}

export function buildDiscountSummary(
  invoices: InvoiceForDiscount[],
  loyaltyRows: { pt_discount: number | null }[],
  employeeNameById?: Map<string, string>
): DiscountSummary {
  const byUser = new Map<string, DiscountByUser>();
  const flagged: FlaggedDiscount[] = [];
  let total = 0;
  for (const inv of invoices) {
    if (inv.doc_status === "draft") continue;
    const { amount, gross } = invoiceDiscount(inv);
    if (amount <= 0) continue;
    const user = displayNameFromEmail(inv.created_by, employeeNameById);
    const row = byUser.get(user) || { user, amount: 0, invoices: 0 };
    row.amount += amount;
    row.invoices += 1;
    byUser.set(user, row);
    total += amount;
    const pct = gross > 0 ? (amount / gross) * 100 : 0;
    if (pct >= DISCOUNT_FLAG_PCT) flagged.push({ reference: inv.invoice_number, href: `/sales/invoices/${inv.id}`, user, pct: Math.round(pct), amount });
  }
  return {
    total,
    byUser: Array.from(byUser.values()).sort((a, b) => b.amount - a.amount),
    flagged: flagged.sort((a, b) => b.pct - a.pct),
    loyaltyRedeemed: loyaltyRows.reduce((s, r) => s + (r.pt_discount || 0), 0),
  };
}

// ── Sold today ───────────────────────────────────────────────────────────

export interface SoldRow {
  name: string;
  qty: number;
  amount?: number;
}

export interface SoldToday {
  garments: SoldRow[];
  products: SoldRow[];
  newCustomers: number;
  repeatCustomers: number;
}

export function buildSoldToday(
  orders: { mobile: string; garments: unknown }[],
  invoices: { doc_status: string; items: unknown }[],
  newCustomerMobiles: Set<string>
): SoldToday {
  const garments = new Map<string, SoldRow>();
  for (const o of orders) {
    for (const g of (Array.isArray(o.garments) ? o.garments : []) as { type?: string; no?: number }[]) {
      const name = g.type || "Garment";
      const row = garments.get(name) || { name, qty: 0 };
      row.qty += g.no || 1;
      garments.set(name, row);
    }
  }
  const products = new Map<string, SoldRow>();
  for (const inv of invoices) {
    if (inv.doc_status === "draft") continue;
    for (const i of asItems(inv.items)) {
      const name = i.productName || "Item";
      const row = products.get(name) || { name, qty: 0, amount: 0 };
      row.qty += i.qty || 0;
      row.amount = (row.amount || 0) + (i.amount || 0);
      products.set(name, row);
    }
  }
  const mobiles = new Set(orders.map((o) => o.mobile).filter(Boolean));
  const newCount = Array.from(mobiles).filter((m) => newCustomerMobiles.has(m)).length;
  const top = (m: Map<string, SoldRow>) => Array.from(m.values()).sort((a, b) => b.qty - a.qty).slice(0, 6);
  return { garments: top(garments), products: top(products), newCustomers: newCount, repeatCustomers: mobiles.size - newCount };
}

// ── Collections follow-up ────────────────────────────────────────────────

export interface CollectionItem {
  orderId: string;
  customerName: string;
  mobile: string;
  deliveryDate: string;
  balance: number;
  status: string;
}

export interface Collections {
  items: CollectionItem[];
  totalDue: number;
  count: number;
}

// ── Attendance board ─────────────────────────────────────────────────────

export interface AttendanceRowOut {
  name: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  hours: number | null;
  overtime: number;
}

export interface AttendanceBoard {
  present: AttendanceRowOut[];
  absent: string[];
  onLeave: string[];
  /** Active staff with no attendance record and no approved leave for the day. */
  notMarked: string[];
}

export function buildAttendanceBoard(
  employees: { id: string; name: string; active: boolean }[],
  rows: { employee_id: string; status: string; check_in_at: string | null; check_out_at: string | null; hours_worked: number | null; overtime_hours: number }[],
  leaveEmployeeIds: Set<string>
): AttendanceBoard {
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const seen = new Set<string>();
  const board: AttendanceBoard = { present: [], absent: [], onLeave: [], notMarked: [] };
  for (const r of rows) {
    seen.add(r.employee_id);
    const name = nameById.get(r.employee_id) || "Unknown";
    const status = (r.status || "").toLowerCase();
    if (status === "absent") board.absent.push(name);
    else if (status === "leave") board.onLeave.push(name);
    else board.present.push({ name, status: r.status, checkIn: r.check_in_at, checkOut: r.check_out_at, hours: r.hours_worked, overtime: r.overtime_hours || 0 });
  }
  for (const e of employees) {
    if (!e.active || seen.has(e.id)) continue;
    (leaveEmployeeIds.has(e.id) ? board.onLeave : board.notMarked).push(e.name);
  }
  board.present.sort((a, b) => a.name.localeCompare(b.name));
  return board;
}

// ── Closing history ──────────────────────────────────────────────────────

export interface ClosingHistoryRow {
  date: string;
  expected: number;
  counted: number;
  variance: number;
  closedBy: string | null;
}

export interface ClosingHistory {
  closings: ClosingHistoryRow[];
  /** Days (oldest first) in the window that had money activity but were never closed. */
  unclosedDays: string[];
}

// ── Accountant pack ──────────────────────────────────────────────────────

const VOUCHER_BY_MODULE: Partial<Record<DayBookModule, { sheet: string; voucher: string }>> = {
  sales: { sheet: "Sales", voucher: "Sales" },
  payments: { sheet: "Receipts", voucher: "Receipt" },
  expenses: { sheet: "Expenses", voucher: "Payment" },
  purchases: { sheet: "Purchases", voucher: "Purchase" },
  payroll: { sheet: "Payroll", voucher: "Payroll" },
  stitching: { sheet: "Stitching", voucher: "Stitching Order" },
};

export function buildAccountantSheets(input: {
  date: string;
  entries: DayBookEntry[];
  summary: { label: string; value: string | number }[];
  split: MethodSplit;
  cash: CashPosition;
  closing: DayClosing | null;
  adjustments: CashAdjustment[];
}): { name: string; rows: Record<string, unknown>[] }[] {
  const row = (e: DayBookEntry, voucher: string) => ({
    Date: input.date,
    Time: fmtTime(e.time),
    "Voucher Type": voucher,
    Reference: e.reference || "",
    Party: e.customer || e.vendor || e.employee || "",
    Narration: e.description,
    Amount: e.amount ?? "",
    "Entered By": e.user,
  });

  const summaryRows: Record<string, unknown>[] = [
    ...input.summary.map((s) => ({ Item: s.label, Value: s.value })),
    ...(Object.keys(input.split) as PayMethodKey[]).filter((k) => input.split[k] > 0).map((k) => ({ Item: `Collected — ${PAY_METHOD_LABELS[k]}`, Value: input.split[k] })),
    { Item: "Cash — opening", Value: input.cash.opening },
    { Item: "Cash — received", Value: input.cash.cashIn },
    { Item: "Cash — paid out", Value: input.cash.cashOut },
    { Item: "Cash — expected in drawer", Value: input.cash.expected },
    ...(input.closing
      ? [
          { Item: "Cash — counted", Value: input.closing.countedCash },
          { Item: "Cash — variance", Value: input.closing.variance },
          { Item: "Closed by", Value: input.closing.closedBy || "" },
        ]
      : [{ Item: "Day closed?", Value: "No" }]),
  ];

  const sheets: { name: string; rows: Record<string, unknown>[] }[] = [{ name: "Summary", rows: summaryRows }];
  for (const [module, meta] of Object.entries(VOUCHER_BY_MODULE) as [DayBookModule, { sheet: string; voucher: string }][]) {
    const rows = input.entries.filter((e) => e.module === module && e.amount != null).map((e) => row(e, meta.voucher));
    if (rows.length) sheets.push({ name: meta.sheet, rows });
  }
  if (input.adjustments.length) {
    sheets.push({
      name: "Cash Adjustments",
      rows: input.adjustments.map((a) => ({ Date: a.date, Direction: a.kind === "in" ? "Cash in" : "Cash out", Amount: a.amount, Reason: a.reason, Note: a.note, "Entered By": a.createdBy || "" })),
    });
  }
  sheets.push({
    name: "All Activity",
    rows: input.entries.map((e) => ({ ...row(e, DAY_BOOK_MODULE_LABELS[e.module]), Activity: e.activity })),
  });
  return sheets;
}

/** WhatsApp template variables can't contain newlines — collapse a multi-line summary to one line. */
export function compactSummary(text: string, max = 900): string {
  const out = text
    .replace(/\*/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" • ");
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
