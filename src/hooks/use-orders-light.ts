"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapOrderRowLight, type OrderLight } from "@/lib/types";

// Same column list as use-orders.ts's ORDER_LIST_COLUMNS, minus the seven JSONB/text blob
// columns a call-site-by-call-site audit found no list/summary consumer actually reads:
// special, history, measurements, payments, pay_breakdown, materials, materials_note. Those are
// per-order logs/ledgers (and in payments/pay_breakdown's case, money history) — fine for a
// single order's own detail page (useOrder(id), unaffected by this), expensive to drag along on
// every dashboard widget and notification-bell refresh sharing this query's cache entry.
// IMPORTANT: same discipline as ORDER_LIST_COLUMNS — every column mapOrderRowLight reads must
// appear here, and there is deliberately no `as` cast on the query result, so a column missing
// from this list is a compile error, not a silently-null field for every order.
const ORDER_LIGHT_COLUMNS =
  "id, name, mobile, in_date, delivery_date, in_time, delivery_time, garments, total, advance, tailor, status, order_type, booking_source, fabric_cost, other_cost, rework_flag, rework_reason, rework_flagged_by, rework_flagged_at, rework_count, ready_at, payables_confirmed_at, payables_confirmed_by, piece_rate_paid_at, group_id, lead_id, measurement_profile_id, measurement_profile_name, created_at";

// Same growth-safety-net reasoning as use-orders.ts's SAFETY_LIMIT.
const SAFETY_LIMIT = 20_000;

async function fetchOrdersLight(): Promise<OrderLight[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("orders").select(ORDER_LIGHT_COLUMNS).order("created_at", { ascending: false }).limit(SAFETY_LIMIT);
  if (error) throw error;
  return (data || []).map((r) => mapOrderRowLight(r));
}

/** Lighter-weight counterpart to useOrders() for callers that never need an order's garments-
 *  blob siblings (history/measurements/payments/pay_breakdown/special/materials/materials_note)
 *  — dashboard widgets, the topbar notification bell's own order-derived reads, command palette,
 *  etc. Deliberately its own query key/cache entry (["orders-light"]), not a client-side
 *  derivation of useOrders()'s cache — the whole point is to NOT force every page that only
 *  needs id/name/status/dates to pull the heavy columns just because something else on the app
 *  shares useOrders()'s key. */
export function useOrdersLight() {
  return useQuery({
    queryKey: ["orders-light"],
    queryFn: fetchOrdersLight,
    staleTime: 30_000,
  });
}
