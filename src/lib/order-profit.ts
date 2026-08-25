// Single source of truth for stitching-order profit — used by the New Order form (live,
// estimated), the Edit Order form, Order Details, the Stitching Orders list, and the Order
// Profitability report. Every one of those must show the exact same number for the same order,
// so nothing here may be duplicated locally in any of those places.
import type { Garment, Order, OrderExpense, OrderType } from "@/lib/types";
import type { Lining, Stage, TailorRateCard } from "@/lib/business-rules";

export function sumOrderExpenses(expenses: Pick<OrderExpense, "amount">[]): number {
  return expenses.reduce((s, e) => s + (e.amount || 0), 0);
}

const PRE_READY_STAGES: Stage[] = ["received", "cutting", "stitching"];

/**
 * Tailor cost for one order. Once an order reaches "ready" (or beyond), each garment's real,
 * frozen `payableAmount` is used — the exact figure payroll will actually pay, snapshotted by
 * snapshot_tailor_payables() in the DB (garments with no tailor assigned contribute ₹0, same as
 * that function). Before "ready", nothing has been snapshotted yet, so this estimates every
 * garment via the identical rate-card lookup that function will use once the order gets there
 * (garment type → lining → new/alteration, defaulting lining to "s" when unset) — regardless of
 * whether an individual garment already has its own tailor assigned, since at this stage the
 * order-level tailor is presumed responsible for all of them. The two paths agree exactly at
 * the moment an order reaches ready, so "estimated" glides into "real" without a jump.
 */
export function computeOrderTailorCost(
  order: { garments: Garment[]; status: Stage; orderType: OrderType },
  rates: TailorRateCard
): { amount: number; isEstimate: boolean } {
  if (!PRE_READY_STAGES.includes(order.status)) {
    const amount = order.garments.reduce((s, g) => s + (g.payableAmount || 0), 0);
    return { amount, isEstimate: false };
  }
  const column: "new" | "alteration" = order.orderType === "alteration" ? "alteration" : "new";
  const amount = order.garments.reduce((s, g) => {
    const lining = (g.lining as Lining) || "s";
    const rate = rates[g.type]?.[lining]?.[column] || 0;
    return s + rate * (g.no || 1);
  }, 0);
  return { amount, isEstimate: true };
}

export interface OrderProfitBreakdown {
  revenue: number;
  tailorCost: number;
  tailorCostIsEstimate: boolean;
  stitchingExpenses: number;
  fabricCost: number;
  otherCost: number;
  profit: number;
  marginPct: number | null;
}

export function computeOrderProfit(
  order: Pick<Order, "total" | "garments" | "status" | "orderType" | "fabricCost" | "otherCost">,
  rates: TailorRateCard,
  expenses: Pick<OrderExpense, "amount">[]
): OrderProfitBreakdown {
  const { amount: tailorCost, isEstimate } = computeOrderTailorCost(order, rates);
  const stitchingExpenses = sumOrderExpenses(expenses);
  const fabricCost = order.fabricCost || 0;
  const otherCost = order.otherCost || 0;
  const profit = order.total - tailorCost - stitchingExpenses - fabricCost - otherCost;
  const marginPct = order.total ? Math.round((profit / order.total) * 100) : null;
  return { revenue: order.total, tailorCost, tailorCostIsEstimate: isEstimate, stitchingExpenses, fabricCost, otherCost, profit, marginPct };
}
