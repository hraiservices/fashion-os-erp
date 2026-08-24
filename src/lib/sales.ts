// Sales business logic — Quotations, Invoices, Payments Received, Credit Notes.
// Mirrors lib/purchases.ts on the other side of the ledger: same derived-balance rule,
// same number-generator style, kept as an independent module (not shared code) so Sales
// and Purchases can evolve without coupling to each other.

import { daysLeft } from "@/lib/business-rules";

export interface SalesLineItem {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  /** "percent" (default — unset means percent, so existing saved invoices/quotations from
   *  before flat line-discounts existed keep working unchanged) or "flat". */
  discountType?: "flat" | "percent";
  /** Per-line discount, percent (0-100) — used when discountType is "percent" or unset. Amount below already has this applied. */
  discountPercent: number;
  /** Per-line discount, ₹ — used when discountType is "flat". */
  discountFlat?: number;
  /** Cost price, re-derived server-side from the live Product.costPrice at save time (see
   *  src/app/api/sales/invoices/route.ts) — never trusted from the client. Frozen once saved,
   *  so a later cost-price change never rewrites the margin on an already-saved invoice.
   *  Absent (not 0) on any line saved before this server-side verification existed — that's
   *  "we don't know", not "the cost was zero", and must be treated differently (see
   *  lineItemMargin below) or a legacy invoice would misleadingly show 100% margin. */
  costPrice?: number;
  amount: number;
}

/** This line's contribution to gross profit — its (already-discounted) amount minus what the
 *  goods actually cost. Returns null (not 0) when costPrice was never recorded for this line —
 *  distinct from a genuinely ₹0 cost, so a legacy line doesn't silently read as 100% margin. */
export function lineItemMargin(item: SalesLineItem): number | null {
  if (item.costPrice === undefined) return null;
  return Math.round((item.amount - item.qty * item.costPrice) * 100) / 100;
}

/** Total profit margin across every line, minus the invoice-level discount (a straight ₹
 *  reduction in revenue that doesn't touch cost, so it comes off margin ₹-for-₹). Reused by
 *  both the invoice form's live estimate and the invoices list's per-row figure — the same
 *  math either way, just fed different `invoiceDiscountAmount` inputs (computeInvoiceTotals's
 *  discountAmount). Returns null if any line's cost is unknown — a partial sum would understate
 *  cost and overstate margin, which is worse than plainly saying "unknown". */
export function computeInvoiceMargin(items: SalesLineItem[], invoiceDiscountAmount: number): number | null {
  if (items.length === 0) return 0;
  const lineMargins = items.map(lineItemMargin);
  if (lineMargins.some((m) => m === null)) return null;
  const lineMargin = (lineMargins as number[]).reduce((s, m) => s + m, 0);
  return Math.round((lineMargin - (invoiceDiscountAmount || 0)) * 100) / 100;
}

function genNumber(prefix: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export const genQuoteNumber = () => genNumber("QUO");
export const genInvoiceNumber = () => genNumber("INV");
export const genSalesCreditNumber = () => genNumber("SCN");

export function computeLineItemsTotal(items: SalesLineItem[]): number {
  return items.reduce((s, i) => s + (i.amount || 0), 0);
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "expired" | "cancelled";
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  expired: "Expired",
  cancelled: "Cancelled",
};

export type InvoicePaymentStatus = "unpaid" | "partial" | "paid";

/**
 * An invoice's payable amount is always derived — never a stored/cached column — same
 * rule as purchase bill balances, order balances, and inventory stock. A credit note
 * against this invoice (a return) reduces the amount owed before payments are applied;
 * a credit note only ever targets one specific invoice — no floating/unlinked credits.
 */
export function deriveInvoiceBalance(invoiceTotal: number, creditsTotal: number, paymentsTotal: number): number {
  const effectiveTotal = Math.max(0, (invoiceTotal || 0) - (creditsTotal || 0));
  return Math.max(0, effectiveTotal - (paymentsTotal || 0));
}

export function invoicePaymentStatus(invoiceTotal: number, creditsTotal: number, paymentsTotal: number): InvoicePaymentStatus {
  const balance = deriveInvoiceBalance(invoiceTotal, creditsTotal, paymentsTotal);
  const effectiveTotal = Math.max(0, (invoiceTotal || 0) - (creditsTotal || 0));
  if (balance <= 0) return "paid";
  if (balance < effectiveTotal) return "partial";
  return "unpaid";
}

/**
 * Single definition of "average days to get paid" — an invoice has actually "been paid"
 * only once it's fully settled, so this counts fully-paid invoices only (a partial payment
 * doesn't mean paid yet). Previously the Sales Invoices list and the dedicated Time to Get
 * Paid report each computed this independently with different populations (paid-only vs.
 * any-payment) and different negative-day handling, so the same label showed two different
 * numbers a click apart.
 */
export function avgDaysToGetPaid(invoices: { paymentStatus: InvoicePaymentStatus; invoiceDate: string; lastPaymentDate: string | null }[]): number | null {
  const settled = invoices.filter((inv) => inv.paymentStatus === "paid" && inv.lastPaymentDate);
  if (!settled.length) return null;
  const totalDays = settled.reduce((s, inv) => s + Math.max(0, (new Date(inv.lastPaymentDate!).getTime() - new Date(inv.invoiceDate).getTime()) / 86_400_000), 0);
  return Math.round(totalDays / settled.length);
}

export const INVOICE_STATUS_LABELS: Record<InvoicePaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partially paid",
  paid: "Paid",
};

/** Draft/Sent/Viewed — independent of payment status. Purely "have I sent this / has the customer opened it yet". */
export const DOC_STATUS_LABELS: Record<"draft" | "sent" | "viewed", string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
};

export type DueTone = "overdue" | "dueToday" | "dueSoon" | "upcoming" | "paid" | "none";

export interface InvoiceDueBadge {
  text: string;
  tone: DueTone;
}

/**
 * Due-date status label for the invoice list — mirrors dueBadge() for stitching orders.
 * "Paid" always wins regardless of due date; otherwise driven by days-until-due.
 */
export function invoiceDueBadge(dueDate: string | null, paymentStatus: InvoicePaymentStatus): InvoiceDueBadge {
  if (paymentStatus === "paid") return { text: "Paid", tone: "paid" };
  if (!dueDate) return { text: "No due date", tone: "none" };

  const days = daysLeft(dueDate);

  if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, tone: "overdue" };
  if (days === 0) return { text: "Due today", tone: "dueToday" };
  if (days <= 7) return { text: `Due in ${days}d`, tone: "dueSoon" };
  return { text: `Due in ${days}d`, tone: "upcoming" };
}
