// Cross-customer version of the merge in customer-ledger.ts — feeds any report that wants
// "all sales, Stitching + Retail together, with a filter to split when needed" instead of
// each report reinventing its own combine/split logic.
import type { Order } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import { getOrderOutstanding, getInvoiceOutstanding } from "@/lib/balances";
import { loyaltyDiscountOf, couponDiscountOf } from "@/lib/business-rules";

export type SaleType = "stitching" | "retail";
export type SaleTypeFilter = "all" | SaleType;

export interface UnifiedSale {
  id: string;
  date: string;
  type: SaleType;
  customerMobile: string;
  customerName: string;
  reference: string;
  billed: number;
  paid: number;
  balance: number;
  href: string;
}

export function buildUnifiedSales(orders: Order[], invoices: SalesInvoiceWithBalance[]): UnifiedSale[] {
  const orderSales: UnifiedSale[] = orders.map((o) => ({
    id: `order-${o.id}`,
    date: o.inDate,
    type: "stitching",
    customerMobile: o.mobile,
    customerName: o.name,
    reference: o.id,
    billed: o.total || 0,
    // Cash actually collected — loyalty/coupon discounts reduce the balance without any money
    // changing hands, so a plain total-minus-balance counts them as if they were paid. Same
    // exclusion applied in analytics.ts getMonthly and use-dashboard-stats.ts; without it this
    // report disagreed with both (and with the real order_payments ledger) on every discounted order.
    paid: Math.max(0, (o.total || 0) - (o.balance || 0) - loyaltyDiscountOf(o) - couponDiscountOf(o)),
    balance: getOrderOutstanding(o),
    href: `/orders/${o.id}`,
  }));

  const invoiceSales: UnifiedSale[] = invoices.map((inv) => ({
    id: `invoice-${inv.id}`,
    date: inv.invoiceDate,
    type: "retail",
    customerMobile: inv.customerMobile,
    customerName: inv.customerName,
    reference: inv.invoiceNumber,
    billed: inv.total || 0,
    paid: inv.paidTotal || 0,
    balance: getInvoiceOutstanding(inv),
    href: `/sales/invoices/${inv.id}`,
  }));

  return [...orderSales, ...invoiceSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function filterByType(sales: UnifiedSale[], filter: SaleTypeFilter): UnifiedSale[] {
  return filter === "all" ? sales : sales.filter((s) => s.type === filter);
}
