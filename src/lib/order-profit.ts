// Single source of truth for stitching-order profit — used by the New Order form (live,
// estimated), the Edit Order form, Order Details, the Stitching Orders list, and the Order
// Profitability report. Every one of those must show the exact same number for the same order,
// so nothing here may be duplicated locally in any of those places.
import type { Garment, Order, OrderExpense } from "@/lib/types";

export function sumOrderExpenses(expenses: Pick<OrderExpense, "amount">[]): number {
  return expenses.reduce((s, e) => s + (e.amount || 0), 0);
}

/**
 * Tailor cost for one order — simply the sum of each garment's `payableAmount`. There is no
 * server-side rate-card recalculation anymore (see remove_tailor_payable_confirm_step.sql /
 * the variable-pricing order-form change): a garment's payable is a plain editable figure a
 * sales/manager/admin user enters on the order (pre-filled from the Tailor Payable Rate card
 * as a starting suggestion, same as the customer Rate field), exactly like `amount` already is.
 * `isEstimate` is purely a display label — true until a payroll run actually pays the order out
 * (pieceRatePaidAt), after which the figure is the exact amount that was paid.
 */
export function computeOrderTailorCost(order: { garments: Garment[]; pieceRatePaidAt?: string | null }): { amount: number; isEstimate: boolean } {
  const amount = order.garments.reduce((s, g) => s + (g.payableAmount || 0), 0);
  return { amount, isEstimate: !order.pieceRatePaidAt };
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
  order: Pick<Order, "total" | "garments" | "fabricCost" | "otherCost" | "pieceRatePaidAt">,
  expenses: Pick<OrderExpense, "amount">[]
): OrderProfitBreakdown {
  const { amount: tailorCost, isEstimate } = computeOrderTailorCost(order);
  const stitchingExpenses = sumOrderExpenses(expenses);
  const fabricCost = order.fabricCost || 0;
  const otherCost = order.otherCost || 0;
  const profit = order.total - tailorCost - stitchingExpenses - fabricCost - otherCost;
  const marginPct = order.total ? Math.round((profit / order.total) * 100) : null;
  return { revenue: order.total, tailorCost, tailorCostIsEstimate: isEstimate, stitchingExpenses, fabricCost, otherCost, profit, marginPct };
}
