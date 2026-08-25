import type { SalesPayment, OrderPayment } from "@/lib/types";

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

/** `orderByIdMap` resolves the customer, since order_payments itself only carries order_id, not
 *  a name/mobile. */
export function buildOrderPaymentRows(
  rows: OrderPayment[],
  orderByIdMap: Map<string, { name: string; mobile: string }>
): PaymentReceivedRow[] {
  return rows.map((r) => {
    const order = orderByIdMap.get(r.orderId);
    return {
      id: `ord-${r.id}`,
      date: r.createdAt,
      source: "stitching",
      customerName: order?.name || "",
      customerMobile: order?.mobile || "",
      method: r.method || "Other",
      amount: r.amount,
      reference: r.orderId,
      referenceHref: `/orders/${r.orderId}`,
    };
  });
}

export function sortPaymentRows(rows: PaymentReceivedRow[], order: "asc" | "desc" = "desc"): PaymentReceivedRow[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return order === "desc" ? sorted.reverse() : sorted;
}
