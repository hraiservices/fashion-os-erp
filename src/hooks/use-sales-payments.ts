"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { mapSalesPaymentRow } from "@/lib/types";

async function fetchPaymentsForInvoice(invoiceId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("sales_payments").select("*").eq("invoice_id", invoiceId).order("date", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSalesPaymentRow);
}

export function useSalesPaymentsForInvoice(invoiceId: string) {
  return useQuery({
    queryKey: ["sales-payments", "invoice", invoiceId],
    queryFn: () => fetchPaymentsForInvoice(invoiceId),
    enabled: !!invoiceId,
  });
}

async function fetchAllPayments() {
  const supabase = createClient();
  // Paged — see the note in use-order-payments.ts: unpaged, this silently reported only the
  // most recent 1000 payments as the shop's entire collections history.
  const rows = await fetchAll((from, to) => supabase.from("sales_payments").select("*").order("date", { ascending: false }).range(from, to));
  return rows.map(mapSalesPaymentRow);
}

/** All payments received, across every invoice — for the global Payments Received list. */
export function useAllSalesPayments() {
  return useQuery({
    queryKey: ["sales-payments", "all"],
    queryFn: fetchAllPayments,
    staleTime: 15_000,
  });
}
