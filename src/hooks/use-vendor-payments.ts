"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapVendorPaymentRow } from "@/lib/types";

async function fetchPaymentsForBill(billId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("vendor_payments").select("*").eq("bill_id", billId).order("date", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapVendorPaymentRow);
}

export function useVendorPaymentsForBill(billId: string) {
  return useQuery({
    queryKey: ["vendor-payments", "bill", billId],
    queryFn: () => fetchPaymentsForBill(billId),
    enabled: !!billId,
  });
}

async function fetchAllVendorPayments() {
  const supabase = createClient();
  const { data, error } = await supabase.from("vendor_payments").select("*").order("date", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapVendorPaymentRow);
}

/** All payments made, across every bill — for the global Payments Made list. */
export function useAllVendorPayments() {
  return useQuery({
    queryKey: ["vendor-payments", "all"],
    queryFn: fetchAllVendorPayments,
    staleTime: 15_000,
  });
}
