// Shared payment-terms vocabulary for customers, sales invoices, and purchase bills —
// one place so "Net 30" means the same 30 days everywhere it appears.

export type PaymentTerm = "due_on_receipt" | "net_15" | "net_30" | "net_45" | "custom";

export const PAYMENT_TERM_LABELS: Record<PaymentTerm, string> = {
  due_on_receipt: "Due on Receipt",
  net_15: "Net 15",
  net_30: "Net 30",
  net_45: "Net 45",
  custom: "Custom",
};

/** Days to add to the document date to get the due date. null for "custom" — user picks the due date directly. */
export const PAYMENT_TERM_DAYS: Record<PaymentTerm, number | null> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_45: 45,
  custom: null,
};

export const PAYMENT_TERMS: PaymentTerm[] = ["due_on_receipt", "net_15", "net_30", "net_45", "custom"];

/** Computes a due date (yyyy-mm-dd) from a document date + payment term. Returns the document date unchanged for "custom". */
export function dueDateFromTerm(docDate: string, term: PaymentTerm): string {
  const days = PAYMENT_TERM_DAYS[term];
  if (days == null || !docDate) return docDate;
  const d = new Date(docDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
