"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapSalesQuotationRow } from "@/lib/types";

async function fetchQuotations() {
  const supabase = createClient();
  const { data, error } = await supabase.from("sales_quotations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSalesQuotationRow);
}

export function useSalesQuotations() {
  return useQuery({
    queryKey: ["sales-quotations"],
    queryFn: fetchQuotations,
    staleTime: 15_000,
  });
}

async function fetchQuotation(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("sales_quotations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapSalesQuotationRow(data) : null;
}

export function useSalesQuotation(id: string) {
  return useQuery({
    queryKey: ["sales-quotation", id],
    queryFn: () => fetchQuotation(id),
    enabled: !!id,
  });
}
