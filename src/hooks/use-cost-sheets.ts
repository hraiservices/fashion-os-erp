"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

async function fetchCostSheets() {
  const supabase = createClient();
  const { data, error } = await supabase.from("product_cost_sheets").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export function useCostSheets() {
  return useQuery({
    queryKey: ["cost-sheets"],
    queryFn: fetchCostSheets,
    staleTime: 30_000,
  });
}
