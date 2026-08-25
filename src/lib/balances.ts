// Single source of truth for "is this order/invoice outstanding" and "how much is due."
// Previously this predicate (`o.status !== "payment" && (o.balance || 0) > 0`) was hand-copied
// into ~9 files across CRM, dashboard widgets, and analytics — a classic source of report drift
// if one copy gets a bugfix and the others don't. Every report/widget/statement should import
// from here instead of reimplementing the check.
import type { Order } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";

/** A stitching order owes money whenever its balance is above zero — the stage is irrelevant.
 *  This previously also required `status !== "payment"`, which meant an order sitting in the
 *  terminal "payment" stage while still carrying a balance reported ₹0 owed. That silently hid
 *  real receivables (the customer genuinely still owes it) and broke the
 *  billed = collected + outstanding identity, so the same customer showed a balance on their
 *  order page and ₹0 on Customer Balances. The stage being wrong is a data problem to fix on
 *  the order; it must not make the money disappear from reports. */
export function isOrderOutstanding(order: Pick<Order, "status" | "balance">): boolean {
  return (order.balance || 0) > 0;
}

/** 0 if the order is fully settled, otherwise the balance owed. */
export function getOrderOutstanding(order: Pick<Order, "status" | "balance">): number {
  return isOrderOutstanding(order) ? order.balance || 0 : 0;
}

/** Sales invoices have no terminal "stage" gate — balance is already fully derived (total - paid - credits). */
export function isInvoiceOutstanding(invoice: Pick<SalesInvoiceWithBalance, "balance">): boolean {
  return (invoice.balance || 0) > 0;
}

export function getInvoiceOutstanding(invoice: Pick<SalesInvoiceWithBalance, "balance">): number {
  return invoice.balance || 0;
}

export function sumOrdersOutstanding(orders: Pick<Order, "status" | "balance">[]): number {
  return orders.reduce((s, o) => s + getOrderOutstanding(o), 0);
}

export function sumInvoicesOutstanding(invoices: Pick<SalesInvoiceWithBalance, "balance">[]): number {
  return invoices.reduce((s, i) => s + getInvoiceOutstanding(i), 0);
}
