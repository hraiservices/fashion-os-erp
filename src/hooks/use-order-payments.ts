"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { mapOrderPaymentRow } from "@/lib/types";

async function fetchPaymentsForOrder(orderId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("order_payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapOrderPaymentRow);
}

export function useOrderPayments(orderId: string) {
  return useQuery({
    queryKey: ["order-payments", orderId],
    queryFn: () => fetchPaymentsForOrder(orderId),
    enabled: !!orderId,
  });
}

async function fetchAllOrderPayments() {
  const supabase = createClient();
  // Paged with fetchAll: PostgREST caps a response at 1000 rows and says nothing when it cuts
  // one short, so an unpaged select quietly dropped the oldest payments once the shop had
  // logged more than that — and because every consumer (Payments Received, Payment Methods,
  // the customer's payment history) sums these rows, the reported total simply shrank to the
  // most recent 1000 payments with no warning anywhere.
  const rows = await fetchAll((from, to) => supabase.from("order_payments").select("*").order("created_at", { ascending: false }).range(from, to));
  return rows.map(mapOrderPaymentRow);
}

/** All stitching-order payments ever recorded — for reports (Payment Methods, Payments
 *  Received) that need the whole ledger, not just one order's. */
export function useAllOrderPayments() {
  return useQuery({
    queryKey: ["order-payments", "all"],
    queryFn: fetchAllOrderPayments,
    staleTime: 15_000,
  });
}
