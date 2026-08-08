// Combined P&L — every revenue stream (stitching + retail sales) against every cost stream
// (purchases, manufacturing labor, shop expenses). Kept as its own module rather than folded
// into lib/analytics.ts since it spans modules that evolved independently.
import type { Order, Expense } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import type { PurchaseBillWithBalance } from "@/hooks/use-purchase-bills";
import type { WorkOrder } from "@/lib/types";

function fmtMon(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function getLast6Months(): string[] {
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().substring(0, 7));
  }
  return months;
}

export interface CombinedMonthStat {
  month: string;
  label: string;
  stitchingRevenue: number;
  salesRevenue: number;
  revenue: number;
  purchaseCost: number;
  laborCost: number;
  expenseCost: number;
  totalCost: number;
  netProfit: number;
}

export function getCombinedMonthly(
  orders: Order[],
  invoices: SalesInvoiceWithBalance[],
  bills: PurchaseBillWithBalance[],
  workOrders: WorkOrder[],
  expenses: Expense[]
): CombinedMonthStat[] {
  return getLast6Months().map((month) => {
    const stitchingRevenue = orders.filter((o) => o.inDate?.startsWith(month)).reduce((s, o) => s + (o.total || 0), 0);
    const salesRevenue = invoices.filter((i) => i.invoiceDate?.startsWith(month)).reduce((s, i) => s + i.total, 0);
    const purchaseCost = bills.filter((b) => b.billDate?.startsWith(month)).reduce((s, b) => s + b.total, 0);
    const laborCost = workOrders
      .filter((w) => w.status === "completed" && w.completedAt?.startsWith(month))
      .reduce((s, w) => s + (w.laborCost || 0), 0);
    const expenseCost = expenses.filter((e) => e.date?.startsWith(month)).reduce((s, e) => s + e.amount, 0);

    const revenue = stitchingRevenue + salesRevenue;
    const totalCost = purchaseCost + laborCost + expenseCost;

    return {
      month,
      label: fmtMon(month),
      stitchingRevenue,
      salesRevenue,
      revenue,
      purchaseCost,
      laborCost,
      expenseCost,
      totalCost,
      netProfit: revenue - totalCost,
    };
  });
}
