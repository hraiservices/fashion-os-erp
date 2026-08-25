"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
  const { data, error } = await supabase.from("order_payments").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapOrderPaymentRow);
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
