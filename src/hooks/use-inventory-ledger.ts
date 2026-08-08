"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapLedgerRow } from "@/lib/types";

async function fetchLedger() {
  const supabase = createClient();
  const { data, error } = await supabase.from("inventory_ledger").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).map(mapLedgerRow);
}

/** Most recent 200 stock movements across both raw materials and products. */
export function useInventoryLedger() {
  return useQuery({
    queryKey: ["inventory-ledger"],
    queryFn: fetchLedger,
    staleTime: 15_000,
  });
}
