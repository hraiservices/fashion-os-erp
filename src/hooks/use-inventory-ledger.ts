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

async function fetchRawMaterialConsumption(lookbackDays: number): Promise<Map<string, number>> {
  const supabase = createClient();
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
  // Only outgoing movements (movement < 0) count as consumption — a purchase/adjustment/
  // transfer-in on the same item is a separate, unrelated event, not "reversed" consumption.
  const { data, error } = await supabase
    .from("inventory_ledger")
    .select("item_id, movement")
    .eq("item_type", "raw_material")
    .lt("movement", 0)
    .gte("created_at", since);
  if (error) throw error;

  const byItem = new Map<string, number>();
  for (const row of data || []) {
    byItem.set(row.item_id, (byItem.get(row.item_id) || 0) + Math.abs(row.movement));
  }
  return byItem;
}

/** `item_id -> total quantity consumed` over the trailing `lookbackDays` — feeds the "runs out
 *  in ~N days" reorder estimate on the Raw Materials page (src/lib/inventory.ts's
 *  estimateReorder). Not aggregated server-side since the shop-scale ledger volume this needs
 *  to scan is small enough that a plain filtered query is simpler than adding a DB view. */
export function useRawMaterialConsumption(lookbackDays: number) {
  return useQuery({
    queryKey: ["raw-material-consumption", lookbackDays],
    queryFn: () => fetchRawMaterialConsumption(lookbackDays),
    staleTime: 60_000,
  });
}
