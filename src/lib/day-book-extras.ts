import { inr, fmtDate } from "@/lib/format";
import type { DayBookEntry } from "@/lib/day-book";

/**
 * Pure (client + server safe) Day Book extras: payment-method split, cash position, day
 * closing, day-over-day comparison, deliveries, review flags and the WhatsApp summary text.
 * The DB-touching half lives in day-book-server.ts.
 */

export type PayMethodKey = "cash" | "upi" | "card" | "bank" | "other";
export type MethodSplit = Record<PayMethodKey, number>;

export const PAY_METHOD_LABELS: Record<PayMethodKey, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank: "Bank",
  other: "Other",
};

export const PAY_METHOD_COLORS: Record<PayMethodKey, string> = {
  cash: "#059669",
  upi: "#0ea5e9",
  card: "#a855f7",
  bank: "#f59e0b",
  other: "#94a3b8",
};

export function emptySplit(): MethodSplit {
  return { cash: 0, upi: 0, card: 0, bank: 0, other: 0 };
}

/** Free-text pay methods ("Cash", "UPI", "GPay", "Bank Transfer", "NEFT"…) folded to five buckets. */
export function normalizeMethod(method: string | null | undefined): PayMethodKey {
  const m = (method || "").toLowerCase();
  if (!m) return "other";
  if (m.includes("cash")) return "cash";
  if (/(upi|gpay|google ?pay|phone ?pe|paytm|bhim)/.test(m)) return "upi";
  if (m.includes("card") || m.includes("pos")) return "card";
  if (/(bank|neft|imps|rtgs|cheque|check|transfer)/.test(m)) return "bank";
  return "other";
}

/** Expenses at or above this are surfaced in "Needs review". */
export const LARGE_EXPENSE_THRESHOLD = 10000;

export interface CashPosition {
  /** Previous closed day's counted cash (0 if the drawer has never been closed before). */
  opening: number;
  cashIn: number;
  cashOut: number;
  /** What cashIn / cashOut are made of — shown as the drawer's breakdown lines. */
  breakdown: {
    receipts: number;
    adjustmentsIn: number;
    expenses: number;
    vendorPayments: number;
    advances: number;
    adjustmentsOut: number;
  };
  /** opening + cashIn − cashOut */
  expected: number;
  /** Date of the closing the opening figure came from, if any. */
  openingFromDate: string | null;
}

export interface DayClosing {
  closeDate: string;
  openingCash: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  note: string;
  closedBy: string | null;
  closedAt: string;
}

export interface ComparisonTotals {
  sales: number;
  payments: number;
  expenses: number;
  purchases: number;
  refunds: number;
  /** Stitching orders created + retail invoices (non-draft) — the day's total billed value. */
  totalBilled: number;
}

export interface DeliveryItem {
  orderId: string;
  customerName: string;
  mobile: string;
  deliveryDate: string;
  total: number;
  balance: number;
  status: string;
}

export interface DeliveryBoard {
  dueToday: DeliveryItem[];
  /** Past-due and still not delivered — only computed when viewing today. */
  overdue: DeliveryItem[];
  deliveredToday: DeliveryItem[];
  /** Balance still owed on orders delivered today. */
  unpaidOnDeliveredToday: number;
}

export type ReviewSeverity = "warn" | "info";

export interface ReviewFlag {
  id: string;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  href?: string;
  amount?: number;
}

export interface StaffSummary {
  user: string;
  entries: number;
  amount: number;
}

export interface RangeDay {
  date: string;
  sales: number;
  payments: number;
  expenses: number;
  purchases: number;
  refunds: number;
  totalBilled: number;
  cashIn: number;
}

/** % change vs a previous value; null when there is no baseline to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Per-user entry count and amount handled — the accountability view. */
export function summarizeByUser(entries: DayBookEntry[]): StaffSummary[] {
  const map = new Map<string, StaffSummary>();
  for (const e of entries) {
    const key = e.user || "—";
    const row = map.get(key) || { user: key, entries: 0, amount: 0 };
    row.entries += 1;
    row.amount += e.amount || 0;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.entries - a.entries);
}

export function buildEndOfDaySummary(input: {
  date: string;
  shopName?: string;
  sales: number;
  stitchingBilled: number;
  payments: number;
  expenses: number;
  purchases: number;
  split: MethodSplit;
  cash: CashPosition;
  closing: DayClosing | null;
  ordersCreated: number;
  deliveredToday: number;
  dueToday: number;
  overdue: number;
  unpaidOnDelivered: number;
}): string {
  const lines = [
    `*${input.shopName ? `${input.shopName} — ` : ""}Day Book, ${fmtDate(input.date)}*`,
    "",
    `Billed: ${inr(input.sales + input.stitchingBilled)} (stitching ${inr(input.stitchingBilled)}, sales ${inr(input.sales)})`,
    `Collected: ${inr(input.payments)}`,
    ...(input.payments > 0
      ? [`  ${(Object.keys(input.split) as PayMethodKey[]).filter((k) => input.split[k] > 0).map((k) => `${PAY_METHOD_LABELS[k]} ${inr(input.split[k])}`).join(" · ")}`]
      : []),
    `Expenses: ${inr(input.expenses)}   Purchases: ${inr(input.purchases)}`,
    "",
    `Cash: opening ${inr(input.cash.opening)} + in ${inr(input.cash.cashIn)} − out ${inr(input.cash.cashOut)} = *${inr(input.cash.expected)}* expected`,
    ...(input.closing
      ? [`Counted ${inr(input.closing.countedCash)} → ${input.closing.variance === 0 ? "matches ✅" : `${input.closing.variance > 0 ? "over" : "short"} by ${inr(Math.abs(input.closing.variance))}`}`]
      : ["Day not closed yet"]),
    "",
    `Orders created: ${input.ordersCreated} · Delivered: ${input.deliveredToday} · Due today: ${input.dueToday}${input.overdue ? ` · Overdue: ${input.overdue}` : ""}`,
    ...(input.unpaidOnDelivered > 0 ? [`Unpaid on today's deliveries: ${inr(input.unpaidOnDelivered)}`] : []),
  ];
  return lines.join("\n");
}
