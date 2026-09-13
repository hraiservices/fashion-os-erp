// Combined P&L — every revenue stream (stitching + retail sales) against every cost stream
// (purchases, manufacturing labor, shop expenses). Kept as its own module rather than folded
// into lib/analytics.ts since it spans modules that evolved independently.
import type { Order, Expense, OrderExpense, Payslip } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import type { PurchaseBillWithBalance } from "@/hooks/use-purchase-bills";
import type { WorkOrder } from "@/lib/types";
import { last6MonthBuckets, lastNDayBuckets } from "@/lib/period-buckets";

export interface CombinedMonthStat {
  month: string;
  label: string;
  stitchingRevenue: number;
  salesRevenue: number;
  revenue: number;
  purchaseCost: number;
  laborCost: number;
  expenseCost: number;
  /** Stitching job costs: tailor piece-rate payables + fabric + other + per-order stitching
   *  expense line items. Attributed to the order's own month so cost lands with its revenue. */
  stitchingCost: number;
  /** Salaries actually paid out (payslips marked paid), by the month they were paid. */
  payrollCost: number;
  totalCost: number;
  netProfit: number;
}

/** Computes one bucket's stats — shared by getCombinedMonthly (bucket key "yyyy-mm") and
 *  getCombinedDaily (bucket key "yyyy-mm-dd"). Every date field compared here (inDate,
 *  invoiceDate, billDate, completedAt, paidAt) starts with the plain date, so `startsWith(key)`
 *  matches whichever grain the key is at without any other change to the classification logic. */
function computeBucket(
  key: string,
  label: string,
  orders: Order[],
  invoices: SalesInvoiceWithBalance[],
  bills: PurchaseBillWithBalance[],
  workOrders: WorkOrder[],
  expenses: Expense[],
  orderExpenseByOrderId: Map<string, number>,
  payslips: Payslip[]
): CombinedMonthStat {
  const bucketOrders = orders.filter((o) => o.inDate?.startsWith(key));
  const stitchingRevenue = bucketOrders.reduce((s, o) => s + (o.total || 0), 0);
  // Drafts aren't sales yet (nothing has been issued to the customer), and a credit note
  // reverses part of a sale (a return) — both must come out of "revenue", the same
  // total-minus-credits-minus-payments logic already used for an individual invoice's
  // balance (src/hooks/use-sales-invoices.ts deriveInvoiceBalance). Previously this summed
  // every invoice's gross total including drafts and fully-refunded sales, which fed
  // straight into the "Net Profit"/"Margin" cards on this report.
  const salesRevenue = invoices
    .filter((i) => i.invoiceDate?.startsWith(key) && i.docStatus !== "draft")
    .reduce((s, i) => s + Math.max(0, i.total - i.creditsTotal), 0);
  const purchaseCost = bills.filter((b) => b.billDate?.startsWith(key)).reduce((s, b) => s + b.total, 0);
  const laborCost = workOrders
    .filter((w) => w.status === "completed" && w.completedAt?.startsWith(key))
    .reduce((s, w) => s + (w.laborCost || 0), 0);
  const expenseCost = expenses.filter((e) => e.date?.startsWith(key)).reduce((s, e) => s + e.amount, 0);

  // Every direct cost of fulfilling this bucket's stitching orders. Previously omitted
  // entirely, so Net Profit counted the full order value as margin and overstated profit by
  // the whole cost of actually making the garment. Mirrors computeOrderProfit's components
  // (src/lib/order-profit.ts) so per-order and company-level profit agree.
  const stitchingCost = bucketOrders.reduce((s, o) => {
    const tailorCost = (o.garments || []).reduce((g, garment) => g + (garment.payableAmount || 0), 0);
    return s + tailorCost + (o.fabricCost || 0) + (o.otherCost || 0) + (orderExpenseByOrderId.get(o.id) || 0);
  }, 0);

  // Salary only — pieceRatePay is deliberately subtracted out because that exact money is
  // already counted above as the tailor cost of the order it was earned on. Counting the
  // payslip's full netPay here would charge every tailor's piece-rate twice.
  const payrollCost = payslips
    .filter((p) => p.status === "paid" && p.paidAt?.startsWith(key))
    .reduce((s, p) => s + Math.max(0, (p.netPay || 0) - (p.pieceRatePay || 0)), 0);

  const revenue = stitchingRevenue + salesRevenue;
  const totalCost = purchaseCost + laborCost + expenseCost + stitchingCost + payrollCost;

  return {
    month: key,
    label,
    stitchingRevenue,
    salesRevenue,
    revenue,
    purchaseCost,
    laborCost,
    expenseCost,
    stitchingCost,
    payrollCost,
    totalCost,
    netProfit: revenue - totalCost,
  };
}

export function getCombinedMonthly(
  orders: Order[],
  invoices: SalesInvoiceWithBalance[],
  bills: PurchaseBillWithBalance[],
  workOrders: WorkOrder[],
  expenses: Expense[],
  orderExpenses: OrderExpense[] = [],
  payslips: Payslip[] = []
): CombinedMonthStat[] {
  // Per-order stitching expense line items, rolled up by order so they can be attributed to
  // the same month as that order's revenue rather than to whenever they were keyed in.
  const orderExpenseByOrderId = new Map<string, number>();
  for (const e of orderExpenses) {
    orderExpenseByOrderId.set(e.orderId, (orderExpenseByOrderId.get(e.orderId) || 0) + (e.amount || 0));
  }

  return last6MonthBuckets().map(({ key, label }) =>
    computeBucket(key, label, orders, invoices, bills, workOrders, expenses, orderExpenseByOrderId, payslips)
  );
}

/** Same shape as getCombinedMonthly, bucketed by day instead of month — the dashboard's Profit
 *  Overview card uses this for its Week (7) and Month-to-date (day-of-month) views. */
export function getCombinedDaily(
  orders: Order[],
  invoices: SalesInvoiceWithBalance[],
  bills: PurchaseBillWithBalance[],
  workOrders: WorkOrder[],
  expenses: Expense[],
  orderExpenses: OrderExpense[] = [],
  payslips: Payslip[] = [],
  days = 7
): CombinedMonthStat[] {
  const orderExpenseByOrderId = new Map<string, number>();
  for (const e of orderExpenses) {
    orderExpenseByOrderId.set(e.orderId, (orderExpenseByOrderId.get(e.orderId) || 0) + (e.amount || 0));
  }

  return lastNDayBuckets(days).map(({ key, label }) =>
    computeBucket(key, label, orders, invoices, bills, workOrders, expenses, orderExpenseByOrderId, payslips)
  );
}
