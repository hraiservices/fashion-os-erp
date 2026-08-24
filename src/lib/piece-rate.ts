// Tailor piece-rate pay — sums confirmed, snapshotted payables from stitching orders
// (garments[].payableAmount) and manufacturing work orders (laborCost) into a figure that
// plugs into payroll alongside an employee's normal attendance-based gross pay. "Confirmed"
// (payablesConfirmedAt / laborPayableConfirmedAt set) is the enforcement point — a tailor can
// move their own order to "ready" or complete their own work order, but that alone never
// creates payable pay; a payroll manager has to confirm it first. See the confirm-payables /
// confirm-payable routes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Order, WorkOrder } from "@/lib/types";

/** Sums payables for garments assigned to this employee, confirmed, in orders whose readyAt
 *  falls within [periodStart, periodEnd]. `orders` should already be pre-filtered to confirmed
 *  rows in the period by the caller (matches the batch-fetch-once pattern the payroll run
 *  route already uses for attendance/advances). */
export function computeOrderPieceRatePay(employeeId: string, confirmedOrders: Pick<Order, "garments">[]): number {
  let total = 0;
  for (const order of confirmedOrders) {
    for (const g of order.garments) {
      if (g.tailor === employeeId && g.payableAmount) total += g.payableAmount;
    }
  }
  return Math.round(total * 100) / 100;
}

/** Sums laborCost for confirmed work orders assigned to this employee. Same
 *  already-filtered-by-caller convention as computeOrderPieceRatePay. */
export function computeWorkOrderPieceRatePay(employeeId: string, confirmedWorkOrders: Pick<WorkOrder, "tailor" | "laborCost">[]): number {
  const total = confirmedWorkOrders.filter((w) => w.tailor === employeeId).reduce((s, w) => s + (w.laborCost || 0), 0);
  return Math.round(total * 100) / 100;
}

/** The figure that plugs into payroll for one employee, one period. */
export function computePieceRatePay(
  employeeId: string,
  confirmedOrders: Pick<Order, "garments">[],
  confirmedWorkOrders: Pick<WorkOrder, "tailor" | "laborCost">[]
): number {
  return Math.round((computeOrderPieceRatePay(employeeId, confirmedOrders) + computeWorkOrderPieceRatePay(employeeId, confirmedWorkOrders)) * 100) / 100;
}

/**
 * How much more an employee can draw as an advance against piece-rate they've earned but not
 * yet been paid out for. Defined as: everything ever confirmed for them, minus whatever's
 * already landed on a payslip (payslips.piece_rate_pay, summed across every payslip they've
 * had), minus advances already drawn and not yet linked to a payslip. There's no per-garment
 * "paid" marker (unlike employee_advances.payslip_id) — this relies on payroll periods never
 * overlapping, the same assumption the rest of the payroll run already makes for attendance.
 */
export async function getPieceRateAdvanceCap(supabase: SupabaseClient<Database>, employeeId: string): Promise<number> {
  const [ordersRes, workOrdersRes, payslipsRes, advancesRes] = await Promise.all([
    supabase.from("orders").select("garments").not("payables_confirmed_at", "is", null),
    supabase.from("work_orders").select("tailor, labor_cost").eq("tailor", employeeId).not("labor_payable_confirmed_at", "is", null),
    supabase.from("payslips").select("piece_rate_pay").eq("employee_id", employeeId),
    supabase.from("employee_advances").select("amount").eq("employee_id", employeeId).is("payslip_id", null),
  ]);

  const orders = (ordersRes.data || []) as { garments: unknown }[];
  let earnedFromOrders = 0;
  for (const row of orders) {
    const garments = Array.isArray(row.garments) ? (row.garments as { tailor?: string; payableAmount?: number }[]) : [];
    for (const g of garments) {
      if (g.tailor === employeeId && g.payableAmount) earnedFromOrders += g.payableAmount;
    }
  }

  const earnedFromWorkOrders = (workOrdersRes.data || []).reduce((s, w) => s + (w.labor_cost || 0), 0);
  const alreadyPaid = (payslipsRes.data || []).reduce((s, p) => s + (p.piece_rate_pay || 0), 0);
  const alreadyDrawn = (advancesRes.data || []).reduce((s, a) => s + (a.amount || 0), 0);

  return Math.max(0, Math.round((earnedFromOrders + earnedFromWorkOrders - alreadyPaid - alreadyDrawn) * 100) / 100);
}
