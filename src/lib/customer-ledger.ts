// Combines stitching orders and sales invoices into one per-customer ledger — the two
// numbers are always kept separate (Stitch Due vs Sales Due) and only summed into a
// "Total Due" for the collection-follow-up view, never merged silently elsewhere.
import type { Order, Customer } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import { getOrderOutstanding, getInvoiceOutstanding } from "@/lib/balances";

export interface CustomerLedgerRow {
  mobile: string;
  name: string;
  orderCount: number;
  invoiceCount: number;
  stitchDue: number;
  salesDue: number;
  totalDue: number;
  lifetime: number;
}

export function buildCustomerLedger(orders: Order[], invoices: SalesInvoiceWithBalance[], customers: Customer[]): CustomerLedgerRow[] {
  const rows = new Map<string, CustomerLedgerRow>();

  function ensure(mobile: string, name: string): CustomerLedgerRow {
    let row = rows.get(mobile);
    if (!row) {
      row = { mobile, name, orderCount: 0, invoiceCount: 0, stitchDue: 0, salesDue: 0, totalDue: 0, lifetime: 0 };
      rows.set(mobile, row);
    }
    return row;
  }

  // Customers table is the base — guarantees a customer with zero activity still appears.
  customers.forEach((c) => ensure(c.mobile, c.name));

  orders.forEach((o) => {
    if (!o.mobile) return;
    const row = ensure(o.mobile, o.name || rows.get(o.mobile)?.name || "");
    row.orderCount += 1;
    row.lifetime += o.total || 0;
    row.stitchDue += getOrderOutstanding(o);
  });

  invoices.forEach((inv) => {
    if (!inv.customerMobile) return;
    const row = ensure(inv.customerMobile, inv.customerName || rows.get(inv.customerMobile)?.name || "");
    row.invoiceCount += 1;
    row.lifetime += inv.total || 0;
    row.salesDue += getInvoiceOutstanding(inv);
  });

  return Array.from(rows.values())
    .map((r) => ({ ...r, totalDue: r.stitchDue + r.salesDue }))
    .filter((r) => r.orderCount > 0 || r.invoiceCount > 0)
    .sort((a, b) => b.totalDue - a.totalDue);
}

export interface LedgerTransaction {
  id: string;
  date: string;
  type: "stitching" | "retail";
  reference: string;
  description: string;
  billed: number;
  paid: number;
  balance: number;
  href: string;
}

/**
 * Per-customer chronological transaction list for the Customer Statement — one row per
 * order/invoice document, not per individual payment. Orders don't have structured
 * per-payment records (payment collection only appends a free-text line to `history` and
 * adjusts `advance`/`balance` — see app/api/orders/[id]/payment/route.ts), so "Paid" here
 * is `total - balance` at the document level. Invoices do have structured `sales_payments`
 * rows (via `paidTotal`), but are shown at the same document-level granularity for a
 * consistent statement — this is standard practice for a customer statement (vs. a full
 * payment ledger).
 */
export function buildCustomerTransactions(orders: Order[], invoices: SalesInvoiceWithBalance[]): LedgerTransaction[] {
  const orderRows: LedgerTransaction[] = orders.map((o) => ({
    id: `order-${o.id}`,
    date: o.inDate,
    type: "stitching",
    reference: o.id,
    description: (o.garments || []).map((g) => g.type).join(", ") || "Stitching order",
    billed: o.total || 0,
    paid: Math.max(0, (o.total || 0) - (o.balance || 0)),
    balance: getOrderOutstanding(o),
    href: `/orders/${o.id}`,
  }));

  const invoiceRows: LedgerTransaction[] = invoices.map((inv) => ({
    id: `invoice-${inv.id}`,
    date: inv.invoiceDate,
    type: "retail",
    reference: inv.invoiceNumber,
    description: inv.subject || `${inv.items.length} item(s)`,
    billed: inv.total || 0,
    paid: inv.paidTotal || 0,
    balance: getInvoiceOutstanding(inv),
    href: `/sales/invoices/${inv.id}`,
  }));

  return [...orderRows, ...invoiceRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
