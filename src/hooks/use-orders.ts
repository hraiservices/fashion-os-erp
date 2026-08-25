"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapOrderRow, type Order, type OrderRow } from "@/lib/types";

// Excludes images/audios/videos — those are stored as inline base64 (up to 900KB/2MB/4MB
// each, see src/lib/media.ts) and this query runs on EVERY page load (the notification bell
// in the topbar calls useOrders()), not just the orders list. Order detail (useOrder(id))
// fetches the full row including media separately and is unaffected. mapOrderRow already
// defaults these fields to [] when absent from the row, so nothing downstream crashes —
// any UI that specifically needs an order's media must fetch that one order directly rather
// than reading it off a list-sourced Order.
// IMPORTANT: every column mapOrderRow reads must appear here. A column omitted from this list
// does not fail loudly — the row simply arrives without the key and mapOrderRow's `?? null`
// defaults turn it into a silent null for EVERY order. That exact mistake made the Tailor
// Payables report show ₹0 confirmed and re-list already-paid work as still owed (payables_
// confirmed_at / piece_rate_paid_at were missing here), which caused real double payments.
// Hence no `as OrderRow` cast below: the row type must genuinely satisfy mapOrderRow so a
// missing column is a compile error, not a silent wrong number.
const ORDER_LIST_COLUMNS =
  "id, name, mobile, in_date, delivery_date, in_time, delivery_time, garments, total, advance, balance, tailor, status, special, history, measurements, payments, pay_breakdown, order_type, booking_source, fabric_cost, other_cost, rework_flag, rework_reason, rework_flagged_by, rework_flagged_at, ready_at, payables_confirmed_at, payables_confirmed_by, piece_rate_paid_at, created_at, updated_at";

async function fetchOrders(): Promise<Order[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("orders").select(ORDER_LIST_COLUMNS).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => mapOrderRow(r));
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    staleTime: 30_000,
  });
}
