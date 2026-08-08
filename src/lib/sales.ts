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
  /** Per-line discount, percent (0-100). Amount below already has this applied. */
  discountPercent: number;
  amount: number;
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
