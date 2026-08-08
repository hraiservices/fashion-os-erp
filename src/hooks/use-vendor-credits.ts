"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapVendorCreditRow } from "@/lib/types";

async function fetchVendorCredits() {
  const supabase = createClient();
  const { data, error } = await supabase.from("vendor_credits").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapVendorCreditRow);
}

export function useVendorCredits() {
  return useQuery({
    queryKey: ["vendor-credits"],
    queryFn: fetchVendorCredits,
    staleTime: 15_000,
  });
}

async function fetchVendorCreditsForBill(billId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("vendor_credits").select("*").eq("bill_id", billId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapVendorCreditRow);
}

export function useVendorCreditsForBill(billId: string) {
  return useQuery({
    queryKey: ["vendor-credits", "bill", billId],
    queryFn: () => fetchVendorCreditsForBill(billId),
    enabled: !!billId,
  });
}
