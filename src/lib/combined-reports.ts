// Combined P&L — every revenue stream (stitching + retail sales) against every cost stream
// (purchases, manufacturing labor, shop expenses). Kept as its own module rather than folded
// into lib/analytics.ts since it spans modules that evolved independently.
import type { OrderLight, Expense, OrderExpense, Payslip, Employee } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import type { PurchaseBillWithBalance } from "@/hooks/use-purchase-bills";
import type { WorkOrder } from "@/lib/types";
import { last6MonthBuckets, lastNDayBuckets } from "@/lib/period-buckets";
import { isWithinDateRange, type DateRange } from "@/lib/report-date-range";
import { computeCogs } from "@/lib/sales";
import { purchaseItemType } from "@/lib/purchases";
import { normalizePhone } from "@/lib/auth-errors";

/**
 * Salary cost reaches the P&L by two independent routes: payslips (`payrollCost`) and expenses
 * filed under a Salaries-type category (inside `expenseCost`). computeBucket adds both, which is
 * correct only while a shop uses exactly one of them — the documented assumption being that shops
 * here pay tailors by hand and log it as an Expense rather than running payroll.
 *
 * A shop that does both, or that migrates from one to the other mid-year, double-counts salary
 * with nothing detecting it: net profit silently drops by the overlap and every margin on the
 * report is understated. This spots the overlap so the P&L can say so out loud rather than
 * quietly reporting a wrong number. It deliberately does NOT net anything off — which of the two
 * records is the real one is a bookkeeping decision, not something to guess at.
 */
export interface SalaryOverlap {
  /** Bucket key the overlap falls in ("yyyy-mm" or "yyyy-mm-dd"), matching CombinedMonthStat.month. */
  month: string;
  /** Salary-category expense total in this bucket. */
  expenseSalary: number;
  /** Payslip salary (net of piece rate, which is already counted as order cost) in this bucket. */
  payrollSalary: number;
}

const SALARY_CATEGORY_RE = /salar|wage/i;

/** Buckets where BOTH payroll and salary-category expenses carry a non-zero figure — i.e. where
 *  `expenseCost` and `payrollCost` are probably describing the same money twice. */
export function detectSalaryOverlap(stats: CombinedMonthStat[], expenses: Expense[]): SalaryOverlap[] {
  return stats
    .map((s) => ({
      month: s.month,
      expenseSalary: expenses
        .filter((e) => e.date?.startsWith(s.month) && SALARY_CATEGORY_RE.test(e.category || ""))
        .reduce((sum, e) => sum + (e.amount || 0), 0),
      payrollSalary: s.payrollCost,
    }))
    .filter((o) => o.expenseSalary > 0 && o.payrollSalary > 0);
}

export interface CombinedMonthStat {
  month: string;
  label: string;
  stitchingRevenue: number;
  salesRevenue: number;
  revenue: number;
  /** Total goods cost charged to this bucket: `cogs` + `materialPurchases`. Kept under the
   *  original name so every consumer (charts, exports, column customiser) keeps working. */
  purchaseCost: number;
  /** Cost of finished goods actually SOLD this bucket, from the cost frozen on each invoice line. */
  cogs: number;
  /** Raw-material spend from bills dated in this bucket — still period-costed, see computeBucket. */
  materialPurchases: number;
  /** Invoice lines in this bucket with no recorded cost, so excluded from `cogs`. Non-zero means
   *  COGS is understated and margin correspondingly flattered; the report says so rather than
   *  pretending those goods were free. */
  unknownCostLines: number;
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
/** A bucket's match test: does this record's date fall in the bucket's "yyyy-mm" or
 *  "yyyy-mm-dd" key. Shared by every month/day-keyed caller of computeBucket. */
function keyMatcher(key: string) {
  return (dateStr: string | null | undefined) => !!dateStr && dateStr.startsWith(key);
}

function computeBucket(
  key: string,
  label: string,
  matches: (dateStr: string | null | undefined) => boolean,
  orders: OrderLight[],
  invoices: SalesInvoiceWithBalance[],
  bills: PurchaseBillWithBalance[],
  workOrders: WorkOrder[],
  expenses: Expense[],
  orderExpenseByOrderId: Map<string, number>,
  payslips: Payslip[]
): CombinedMonthStat {
  // A cancelled order is not revenue and never was — it keeps its record for audit but leaves
  // every financial total (see add_order_cancellation.sql). Before cancellation existed the only
  // way to take one out of these figures was to delete the order outright.
  const bucketOrders = orders.filter((o) => matches(o.inDate) && !o.cancelledAt);
  const stitchingRevenue = bucketOrders.reduce((s, o) => s + (o.total || 0), 0);
  // Drafts aren't sales yet (nothing has been issued to the customer), and a credit note
  // reverses part of a sale (a return) — both must come out of "revenue", the same
  // total-minus-credits-minus-payments logic already used for an individual invoice's
  // balance (src/hooks/use-sales-invoices.ts deriveInvoiceBalance). Previously this summed
  // every invoice's gross total including drafts and fully-refunded sales, which fed
  // straight into the "Net Profit"/"Margin" cards on this report.
  const bucketInvoices = invoices.filter((i) => matches(i.invoiceDate) && i.docStatus !== "draft");
  const salesRevenue = bucketInvoices.reduce((s, i) => s + Math.max(0, i.total - i.creditsTotal), 0);

  // Cost of what was SOLD, not of what was bought. Expensing every bill in the month it was
  // raised charged unsold finished goods — a balance-sheet asset — straight to profit, and left
  // this report contradicting Profit by Item on the same revenue (a forensic audit measured the
  // gap at ₹77,403 on one month's data). Finished-goods purchases now sit in inventory until an
  // invoice sells them, at which point the cost frozen on that invoice line becomes the expense.
  const cogsResults = bucketInvoices.map((i) => computeCogs(i.items));
  const cogs = Math.round(cogsResults.reduce((s, r) => s + r.cogs, 0) * 100) / 100;
  const unknownCostLines = cogsResults.reduce((s, r) => s + r.unknownCostLines, 0);

  // Raw materials stay on the period-cost convention. Their consumption is only recorded per
  // order as fabricCost/otherCost (counted in stitchingCost below) and shops do not reliably fill
  // those in, so dropping bill-side raw-material spend entirely would make stitching look free.
  // Finished goods are the half that had a real sold-cost to match against, so that is the half
  // that moved.
  const materialPurchases = bills
    .filter((b) => matches(b.billDate))
    .reduce(
      (s, b) => s + b.items.filter((i) => purchaseItemType(i) === "raw_material").reduce((ls, i) => ls + (i.amount || 0), 0),
      0
    );
  const purchaseCost = Math.round((cogs + materialPurchases) * 100) / 100;
  const laborCost = workOrders
    .filter((w) => w.status === "completed" && matches(w.completedAt))
    .reduce((s, w) => s + (w.laborCost || 0), 0);
  const expenseCost = expenses.filter((e) => matches(e.date)).reduce((s, e) => s + e.amount, 0);

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
    .filter((p) => p.status === "paid" && matches(p.paidAt))
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
    cogs,
    materialPurchases,
    unknownCostLines,
    laborCost,
    expenseCost,
    stitchingCost,
    payrollCost,
    totalCost,
    netProfit: revenue - totalCost,
  };
}

export function getCombinedMonthly(
  orders: OrderLight[],
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
    computeBucket(key, label, keyMatcher(key), orders, invoices, bills, workOrders, expenses, orderExpenseByOrderId, payslips)
  );
}

/** Same shape as getCombinedMonthly, bucketed by day instead of month — the dashboard's Profit
 *  Overview card uses this for its Week (7) and Month-to-date (day-of-month) views. */
export function getCombinedDaily(
  orders: OrderLight[],
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
    computeBucket(key, label, keyMatcher(key), orders, invoices, bills, workOrders, expenses, orderExpenseByOrderId, payslips)
  );
}

/** Caps the number of daily bars the Combined P&L chart draws for a custom/long range — well
 *  past this and a per-day chart stops being readable anyway, so beyond it the range collapses
 *  to a single bucket covering the whole period instead of one bar per day. */
const MAX_DAILY_BARS_FOR_RANGE = 120;

/**
 * Combined P&L bucketed to the user's own selected date range, not a fixed trailing-6-month
 * window. getCombinedMonthly/getCombinedDaily always report the last 6 months or N days
 * regardless of what the report's own date-range filter bar shows selected — the filter bar
 * was display-only, so picking "This month" changed nothing and a forensic audit's own fix
 * (real COGS) got reported against stale, unfiltered totals. This is what the Combined P&L page
 * actually calls now: one bucket per day within the range (or one bucket for the whole range,
 * past MAX_DAILY_BARS_FOR_RANGE), so the trend chart and the stat tiles both honor the filter.
 *
 * An unbounded range (`range.from`/`range.to` both "", i.e. "All time") has no natural day
 * axis to draw, so it falls back to the same last-6-months trend getCombinedMonthly already
 * produces — that read as "all time" close enough before this existed, and still does.
 */
export function getCombinedForRange(
  range: DateRange,
  orders: OrderLight[],
  invoices: SalesInvoiceWithBalance[],
  bills: PurchaseBillWithBalance[],
  workOrders: WorkOrder[],
  expenses: Expense[],
  orderExpenses: OrderExpense[] = [],
  payslips: Payslip[] = []
): CombinedMonthStat[] {
  const orderExpenseByOrderId = new Map<string, number>();
  for (const e of orderExpenses) {
    orderExpenseByOrderId.set(e.orderId, (orderExpenseByOrderId.get(e.orderId) || 0) + (e.amount || 0));
  }

  if (!range.from && !range.to) {
    return getCombinedMonthly(orders, invoices, bills, workOrders, expenses, orderExpenses, payslips);
  }

  const matches = (dateStr: string | null | undefined) => isWithinDateRange(dateStr, range);

  // No lower bound ("up to <date>") has no sensible day count to draw daily bars over, so it
  // collapses to one bucket the same way an over-long range does.
  const dayCount = range.from && range.to ? Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000) + 1 : Infinity;

  if (dayCount > MAX_DAILY_BARS_FOR_RANGE) {
    return [computeBucket(`${range.from}..${range.to}`, "Selected range", matches, orders, invoices, bills, workOrders, expenses, orderExpenseByOrderId, payslips)];
  }

  const dayKeys = getLastNDayKeysInRange(range.from, dayCount);
  return dayKeys.map((key) => computeBucket(key, fmtDayLabelLocal(key), keyMatcher(key), orders, invoices, bills, workOrders, expenses, orderExpenseByOrderId, payslips));
}

function getLastNDayKeysInRange(fromKey: string, count: number): string[] {
  const out: string[] = [];
  const start = new Date(fromKey);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

function fmtDayLabelLocal(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export interface SalesPnlStat {
  month: string;
  label: string;
  count: number;
  billed: number;
  /** Cost of goods actually sold, from each invoice line's frozen cost — not period purchases. */
  purchaseCost: number;
  /** Invoice lines with no recorded cost, excluded from the figure above. */
  unknownCostLines: number;
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
    const matches = keyMatcher(key);
    const monthInvoices = invoices.filter((i) => matches(i.invoiceDate) && i.docStatus !== "draft");
    const billed = monthInvoices.reduce((s, i) => s + Math.max(0, i.total - i.creditsTotal), 0);
    // Cost of what was sold, from each line's frozen cost — not every bill raised in the month.
    // This report is product-sales-only, so there is no raw-material half to keep period-costed:
    // it now agrees with Profit by Item, which has always costed this way.
    const cogsResults = monthInvoices.map((i) => computeCogs(i.items));
    const purchaseCost = Math.round(cogsResults.reduce((s, r) => s + r.cogs, 0) * 100) / 100;
    const unknownCostLines = cogsResults.reduce((s, r) => s + r.unknownCostLines, 0);

    const monthExpenses = expenses.filter((e) => matches(e.date));
    const salesSalaryExpense = monthExpenses
      .filter((e) => {
        if (!e.category.toLowerCase().includes("salar")) return false;
        if (e.employeeId) return salesEmployeeIds.has(e.employeeId);
        return !!e.customerMobile && salesMobiles.has(normalizePhone(e.customerMobile));
      })
      .reduce((s, e) => s + e.amount, 0);
    const salesPayrollCost = payslips
      .filter((p) => p.status === "paid" && matches(p.paidAt) && salesEmployeeIds.has(p.employeeId))
      .reduce((s, p) => s + (p.netPay || 0), 0);
    const salesStaffCost = salesSalaryExpense + salesPayrollCost;

    const totalCost = purchaseCost + salesStaffCost;
    return { month: key, label, count: monthInvoices.length, billed, purchaseCost, unknownCostLines, salesStaffCost, totalCost, netProfit: billed - totalCost };
  });
}
