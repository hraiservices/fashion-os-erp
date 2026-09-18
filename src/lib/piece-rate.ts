// Tailor piece-rate pay — sums live payables from stitching orders (garments[].payableAmount)
// and manufacturing work orders (laborCost) into a figure that plugs into payroll alongside an
// employee's normal attendance-based gross pay. There is no separate manager-confirmation step —
// a garment/work-order payable counts as soon as an order is Received and a tailor is assigned
// (the shop pays the tailor regardless of whether the customer has paid yet), and stays live
// (tracking the current tailor rate card) until it's actually paid out by a payroll run, which
// stamps piece_rate_paid_at — see unfreeze_tailor_payables_at_ready.sql /
// remove_tailor_payable_confirm_step.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Order, WorkOrder } from "@/lib/types";

/** Sums payables for garments assigned to this employee, not yet paid out by a payroll run.
 *  `orders` should already be pre-filtered by the caller (matches the batch-fetch-once pattern
 *  the payroll run route already uses for attendance/advances). */
export function computeOrderPieceRatePay(employeeId: string, unpaidOrders: Pick<Order, "garments">[]): number {
  let total = 0;
  for (const order of unpaidOrders) {
    for (const g of order.garments) {
      if (g.tailor === employeeId && g.payableAmount) total += g.payableAmount;
    }
  }
  return Math.round(total * 100) / 100;
}

/** Sums laborCost for not-yet-paid work orders assigned to this employee. Same
 *  already-filtered-by-caller convention as computeOrderPieceRatePay. */
export function computeWorkOrderPieceRatePay(employeeId: string, unpaidWorkOrders: Pick<WorkOrder, "tailor" | "laborCost">[]): number {
  const total = unpaidWorkOrders.filter((w) => w.tailor === employeeId).reduce((s, w) => s + (w.laborCost || 0), 0);
  return Math.round(total * 100) / 100;
}

/** The figure that plugs into payroll for one employee, one period. */
export function computePieceRatePay(
  employeeId: string,
  unpaidOrders: Pick<Order, "garments">[],
  unpaidWorkOrders: Pick<WorkOrder, "tailor" | "laborCost">[]
): number {
  return Math.round((computeOrderPieceRatePay(employeeId, unpaidOrders) + computeWorkOrderPieceRatePay(employeeId, unpaidWorkOrders)) * 100) / 100;
}

/**
 * How much more an employee can draw as an advance against piece-rate they've earned but not
 * yet been paid out for. Defined as: order/work-order payables not yet paid out by a payroll run
 * (piece_rate_paid_at IS NULL — the same marker the payroll run itself sets, see
 * add_piece_rate_p0_fixes.sql), minus advances already drawn and not yet linked to a payslip.
 * Scoping to piece_rate_paid_at IS NULL both keeps this correct — nothing already paid out counts
 * twice — and keeps the orders fetch bounded to the genuinely-outstanding backlog instead of the
 * company's entire order history.
 */
export async function getPieceRateAdvanceCap(supabase: SupabaseClient<Database>, employeeId: string): Promise<number> {
  const [ordersRes, workOrdersRes, advancesRes] = await Promise.all([
    // Scoped server-side to garments actually assigned to this employee via a JSONB
    // containment filter — previously fetched every unpaid order company-wide (full garments
    // payload, no employee filter at all) and did the per-employee match in JS. Harmless at
    // today's order volume but pure waste that scales with total company order count instead of
    // this one employee's, on every single advance request.
    //
    // .filter(..., "cs", ...) rather than .contains(): supabase-js's .contains() branches on
    // typeof value, and for an ARRAY value (which [{ tailor: employeeId }] is) it serializes
    // using Postgres's native-array literal syntax — `cs.{${value.join(',')}}` — not JSON. That
    // syntax is for a real `text[]`/`int[]` column; on a jsonb column, joining an array
    // containing one object stringifies it to the literal text "[object Object]", producing an
    // invalid filter (`garments=cs.{[object Object]}`) that PostgREST rejects. This function
    // never checked ordersRes.error, so that failure was swallowed as "zero matching orders" —
    // every piece-rate tailor's advance cap silently undercounted their order-based earnings by
    // this term, unconditionally, for as long as this line existed. .filter() with an
    // already-JSON-encoded string sidesteps .contains()'s type-based branching entirely.
    supabase
      .from("orders")
      .select("garments")
      .is("piece_rate_paid_at", null)
      .filter("garments", "cs", JSON.stringify([{ tailor: employeeId }])),
    supabase
      .from("work_orders")
      .select("labor_cost")
      .eq("tailor", employeeId)
      .is("piece_rate_paid_at", null),
    supabase.from("employee_advances").select("amount").eq("employee_id", employeeId).is("payslip_id", null),
  ]);

  // A failed query here must not be swallowed into "this employee earned/owes nothing" — that's
  // exactly the failure mode the broken .contains() call above produced for as long as it went
  // unchecked: a silent ₹0 cap that looked like a legitimate business rule instead of a bug.
  if (ordersRes.error) throw new Error(`Could not load unpaid orders for the piece-rate cap: ${ordersRes.error.message}`);
  if (workOrdersRes.error) throw new Error(`Could not load unpaid work orders for the piece-rate cap: ${workOrdersRes.error.message}`);
  if (advancesRes.error) throw new Error(`Could not load existing advances for the piece-rate cap: ${advancesRes.error.message}`);

  const orders = (ordersRes.data || []) as { garments: unknown }[];
  let earnedFromOrders = 0;
  for (const row of orders) {
    const garments = Array.isArray(row.garments) ? (row.garments as { tailor?: string; payableAmount?: number }[]) : [];
    for (const g of garments) {
      if (g.tailor === employeeId && g.payableAmount) earnedFromOrders += g.payableAmount;
    }
  }

  const earnedFromWorkOrders = (workOrdersRes.data || []).reduce((s, w) => s + (w.labor_cost || 0), 0);
  const alreadyDrawn = (advancesRes.data || []).reduce((s, a) => s + (a.amount || 0), 0);

  return Math.max(0, Math.round((earnedFromOrders + earnedFromWorkOrders - alreadyDrawn) * 100) / 100);
}
