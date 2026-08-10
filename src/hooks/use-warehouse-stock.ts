"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface WarehouseStockRow {
  itemType: "raw_material" | "product";
  itemId: string;
  warehouseId: string | null;
  stockQty: number;
}

async function fetchWarehouseStock() {
  const supabase = createClient();
  const { data, error } = await supabase.from("inventory_ledger").select("item_type, item_id, warehouse_id, movement");
  if (error) throw error;

  const totals = new Map<string, WarehouseStockRow>();
  for (const r of data || []) {
    const key = `${r.item_type}:${r.item_id}:${r.warehouse_id ?? "null"}`;
    const existing = totals.get(key);
    if (existing) {
      existing.stockQty += r.movement;
    } else {
      totals.set(key, {
        itemType: r.item_type as "raw_material" | "product",
        itemId: r.item_id,
        warehouseId: r.warehouse_id,
        stockQty: r.movement,
      });
    }
  }
  return Array.from(totals.values());
}

/** Stock per (item, warehouse) — derived from inventory_ledger.warehouse_id, never cached. NULL warehouseId reads as "Main / Unassigned". */
export function useWarehouseStock() {
  return useQuery({
    queryKey: ["warehouse-stock"],
    queryFn: fetchWarehouseStock,
    staleTime: 15_000,
  });
}
