// Combined P&L — every revenue stream (stitching + retail sales) against every cost stream
// (purchases, manufacturing labor, shop expenses). Kept as its own module rather than folded
// into lib/analytics.ts since it spans modules that evolved independently.
import type { Order, Expense, OrderExpense, Payslip, Employee } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import type { PurchaseBillWithBalance } from "@/hooks/use-purchase-bills";
import type { WorkOrder } from "@/lib/types";
import { last6MonthBuckets, lastNDayBuckets } from "@/lib/period-buckets";
import { normalizePhone } from "@/lib/auth-errors";

export interface CombinedMonthStat {
  month: string;
  label: string;
  stitchingRevenue: number;
  salesRevenue: number;
  revenue: number;
  purchaseCost: number;
  laborCost: number;
  expenseCost: number;
  /** Stitching MATERIAL costs only — fabric + other + per-order stitching expense line items.
   *  Deliberately excludes tailor payable: the shop pays tailors manually and logs it as an
   *  Expense (Salaries category) instead of through payroll, so counting payableAmount here
   *  too would double it up alongside that Expense entry. Per-order profit (order-profit.ts,
   *  used by the order form/detail page/Orders list/Order Profitability report) still deducts
   *  tailor cost from that specific order's margin — this exclusion is scoped to the
   *  company-wide P&L only. Attributed to the order's own month so cost lands with its revenue. */
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

  // Material/incidental costs of fulfilling this bucket's stitching orders — fabric, other,
  // and per-order expense line items. Tailor payable is intentionally NOT included: the shop
  // pays tailors manually and logs it as an Expense (Salaries category, counted in expenseCost
  // above) instead of running payroll, so adding payableAmount here too would double-count it.
  const stitchingCost = bucketOrders.reduce((s, o) => {
    return s + (o.fabricCost || 0) + (o.otherCost || 0) + (orderExpenseByOrderId.get(o.id) || 0);
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

export interface SalesPnlStat {
  month: string;
  label: string;
  count: number;
  billed: number;
  purchaseCost: number;
  salesStaffCost: number;
  totalCost: number;
  netProfit: number;
}

/** Product Sales P&L — retail sales revenue against the costs that specifically belong to that
 *  revenue stream, per explicit business rule:
 *   1. Purchases/COGS — every purchase bill dated in the month, same period-cost convention
 *      Combined P&L already uses for purchaseCost (not matched to specific invoices).
 *   2. Sales Staff cost — expenses filed under a "Salaries and Wages"-type category (name
 *      contains "salar") and linked to an employee whose role contains "sales" (by employee_id,
 *      falling back to the Customer Link mobile number for expenses recorded before that link
 *      existed — same convention as getStitchingPnl's tailor matching), plus any Payroll
 *      payslip paid to a sales-role employee.
 *  Deliberately does NOT include tailor payments of any kind (see getStitchingPnl for those) —
 *  the two reports are meant to partition tailor vs. sales-staff cost, not double-count either.
 *  Sales commission is not yet included: sales invoices have no field recording which Sales
 *  Person made the sale, so per-invoice commission can't be attributed (see
 *  computeCommission in commission.ts, which only attributes to stitching Orders via their
 *  tailor field) — planned once a "Sold by" field exists on sales invoices.
 *  Revenue is Billed (accrual), matching Stitching P&L's convention. */
export function getSalesPnl(invoices: SalesInvoiceWithBalance[], bills: PurchaseBillWithBalance[], expenses: Expense[], employees: Employee[], payslips: Payslip[]): SalesPnlStat[] {
  const salesMobiles = new Set(
    employees.filter((e) => e.role.toLowerCase().includes("sales")).map((e) => normalizePhone(e.mobile))
  );
  const salesEmployeeIds = new Set(employees.filter((e) => e.role.toLowerCase().includes("sales")).map((e) => e.id));

  return last6MonthBuckets().map(({ key, label }) => {
    const monthInvoices = invoices.filter((i) => i.invoiceDate?.startsWith(key) && i.docStatus !== "draft");
    const billed = monthInvoices.reduce((s, i) => s + Math.max(0, i.total - i.creditsTotal), 0);
    const purchaseCost = bills.filter((b) => b.billDate?.startsWith(key)).reduce((s, b) => s + b.total, 0);

    const monthExpenses = expenses.filter((e) => e.date?.startsWith(key));
    const salesSalaryExpense = monthExpenses
      .filter((e) => {
        if (!e.category.toLowerCase().includes("salar")) return false;
        if (e.employeeId) return salesEmployeeIds.has(e.employeeId);
        return !!e.customerMobile && salesMobiles.has(normalizePhone(e.customerMobile));
      })
      .reduce((s, e) => s + e.amount, 0);
    const salesPayrollCost = payslips
      .filter((p) => p.status === "paid" && p.paidAt?.startsWith(key) && salesEmployeeIds.has(p.employeeId))
      .reduce((s, p) => s + (p.netPay || 0), 0);
    const salesStaffCost = salesSalaryExpense + salesPayrollCost;

    const totalCost = purchaseCost + salesStaffCost;
    return { month: key, label, count: monthInvoices.length, billed, purchaseCost, salesStaffCost, totalCost, netProfit: billed - totalCost };
  });
}
