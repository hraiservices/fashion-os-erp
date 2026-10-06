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

async function fetchFullLedger() {
  const supabase = createClient();
  // Unlike useInventoryLedger's most-recent-200 view, the Aging Inventory report needs every
  // movement ever recorded per item to FIFO-replay current stock back to when each unsold unit
  // actually entered — paginated in 1000-row pages since Supabase caps a single response there.
  const pageSize = 1000;
  const rows: { item_type: string; item_id: string; movement: number; created_at: string }[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("inventory_ledger")
      .select("item_type, item_id, movement, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows.map((r) => ({ itemType: r.item_type as "raw_material" | "product", itemId: r.item_id, movement: r.movement, createdAt: r.created_at }));
}

/** Full stock-movement history for every item — feeds the Aging Inventory report's FIFO
 *  replay. Not paged/filtered server-side beyond pagination itself since the shop-scale ledger
 *  volume is small enough to fetch in full and simulate client-side. */
export function useFullInventoryLedger() {
  return useQuery({
    queryKey: ["inventory-ledger-full"],
    queryFn: fetchFullLedger,
    staleTime: 60_000,
  });
}

async function fetchProductLedgerWithRefs() {
  const supabase = createClient();
  // Same full-history/paginated shape as fetchFullLedger, but scoped to products and carrying
  // ref_type/ref_id — what computeSaleVendorTrace needs to tell "this stock came from purchase
  // bill X" apart from "this stock left via sale Y", which the plain item/movement/created_at
  // shape useFullInventoryLedger fetches doesn't carry.
  const pageSize = 1000;
  const rows: { item_id: string; movement: number; ref_type: string | null; ref_id: string | null; created_at: string }[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("inventory_ledger")
      .select("item_id, movement, ref_type, ref_id, created_at")
      .eq("item_type", "product")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows.map((r) => ({ itemId: r.item_id, movement: r.movement, refType: r.ref_type || "", refId: r.ref_id, createdAt: r.created_at }));
}

/** Full product stock-movement history including ref_type/ref_id — feeds the Sale Vendor
 *  Traceability report's FIFO replay (computeSaleVendorTrace in src/lib/inventory.ts). */
export function useProductLedgerWithRefs() {
  return useQuery({
    queryKey: ["inventory-ledger-product-refs"],
    queryFn: fetchProductLedgerWithRefs,
    staleTime: 60_000,
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
