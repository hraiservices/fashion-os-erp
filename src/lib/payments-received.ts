import { ORDER_PAYMENT_RE, ORDER_PAYMENT_METHOD_RE } from "@/lib/day-book";
import type { SalesPayment } from "@/lib/types";
import type { OrderPaymentActivityRow } from "@/hooks/use-activity-log";

export type PaymentSource = "invoice" | "stitching";

export interface PaymentReceivedRow {
  id: string;
  date: string; // ISO timestamp
  source: PaymentSource;
  customerName: string;
  customerMobile: string;
  method: string;
  amount: number;
  reference: string; // invoice number or order id
  referenceHref: string;
}

export function buildInvoicePaymentRows(
  payments: SalesPayment[],
  invoiceByIdMap: Map<string, { invoiceNumber: string; customerName: string }>
): PaymentReceivedRow[] {
  return payments.map((p) => {
    const inv = invoiceByIdMap.get(p.invoiceId);
    return {
      id: `inv-${p.id}`,
      date: p.createdAt,
      source: "invoice",
      customerName: inv?.customerName || "",
      customerMobile: p.customerMobile,
      method: p.method || "Other",
      amount: p.amount,
      reference: inv?.invoiceNumber || p.invoiceId,
      referenceHref: `/sales/invoices/${p.invoiceId}`,
    };
  });
}

/** No standalone stitching-order payments table exists (see day-book.ts) — amount and method
 *  are extracted from the same activity_log action text Day Book and Payment Methods already
 *  parse, so this list can never disagree with those. `orderByIdMap` resolves the customer,
 *  since activity_log itself only carries order_id, not a name/mobile. */
export function buildOrderPaymentRows(
  rows: OrderPaymentActivityRow[],
  orderByIdMap: Map<string, { name: string; mobile: string }>
): PaymentReceivedRow[] {
  return rows.map((r) => {
    const order = orderByIdMap.get(r.order_id);
    return {
      id: `ord-${r.id}`,
      date: r.created_at,
      source: "stitching",
      customerName: order?.name || "",
      customerMobile: order?.mobile || "",
      method: r.action.match(ORDER_PAYMENT_METHOD_RE)?.[1] || "Other",
      amount: Number(r.action.match(ORDER_PAYMENT_RE)?.[1]) || 0,
      reference: r.order_id,
      referenceHref: `/orders/${r.order_id}`,
    };
  });
}

export function sortPaymentRows(rows: PaymentReceivedRow[], order: "asc" | "desc" = "desc"): PaymentReceivedRow[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return order === "desc" ? sorted.reverse() : sorted;
}
