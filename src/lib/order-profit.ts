// Single source of truth for stitching-order profit — used by the New Order form (live,
// estimated), the Edit Order form, Order Details, the Stitching Orders list, and the Order
// Profitability report. Every one of those must show the exact same number for the same order,
// so nothing here may be duplicated locally in any of those places.
import type { Garment, Order, OrderExpense, OrderType } from "@/lib/types";
import type { Lining, TailorRateCard } from "@/lib/business-rules";

export function sumOrderExpenses(expenses: Pick<OrderExpense, "amount">[]): number {
  return expenses.reduce((s, e) => s + (e.amount || 0), 0);
}

/**
 * Tailor cost for one order. A garment's `payableAmount` is live — recalculated from the current
 * tailor rate card on every order write, all the way from Received through Ready — and only
 * stops updating once a payroll manager explicitly confirms the order's payables
 * (payablesConfirmedAt), which is the one freeze point (see
 * unfreeze_tailor_payables_at_ready.sql; reaching "ready" no longer freezes anything by itself).
 * Before that confirmation, this mirrors the DB's own live rate-card lookup (garment type →
 * lining, or → alteration for an alteration order, defaulting lining to "s" when unset) so the
 * UI never lags a rate change even between saves; after confirmation, it uses the real frozen
 * `payableAmount` — the exact figure that won't move again.
 */
export function computeOrderTailorCost(
  order: { garments: Garment[]; orderType: OrderType; payablesConfirmedAt?: string | null },
  rates: TailorRateCard
): { amount: number; isEstimate: boolean } {
  if (order.payablesConfirmedAt) {
    const amount = order.garments.reduce((s, g) => s + (g.payableAmount || 0), 0);
    return { amount, isEstimate: false };
  }
  const isAlteration = order.orderType === "alteration";
  const amount = order.garments.reduce((s, g) => {
    const rate = isAlteration ? rates[g.type]?.alteration || 0 : rates[g.type]?.[((g.lining as Lining) || "s")] || 0;
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
  order: Pick<Order, "total" | "garments" | "orderType" | "fabricCost" | "otherCost" | "payablesConfirmedAt">,
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
