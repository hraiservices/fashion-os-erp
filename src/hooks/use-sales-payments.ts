"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
  const { data, error } = await supabase.from("sales_payments").select("*").order("date", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSalesPaymentRow);
}

/** All payments received, across every invoice — for the global Payments Received list. */
export function useAllSalesPayments() {
  return useQuery({
    queryKey: ["sales-payments", "all"],
    queryFn: fetchAllPayments,
    staleTime: 15_000,
  });
}
