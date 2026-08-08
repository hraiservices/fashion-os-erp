"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapRawMaterialRow, type RawMaterial } from "@/lib/types";

async function fetchRawMaterials(): Promise<RawMaterial[]> {
  const supabase = createClient();

  const [{ data: materials, error: matError }, { data: units, error: unitError }, { data: stock, error: stockError }] = await Promise.all([
    supabase.from("raw_materials").select("*").order("name"),
    supabase.from("units_of_measure").select("*"),
    supabase.from("inventory_stock").select("*").eq("item_type", "raw_material"),
  ]);
  if (matError) throw matError;
  if (unitError) throw unitError;
  if (stockError) throw stockError;

  const unitNameById = new Map((units || []).map((u) => [u.id, u.name]));
  const stockByItemId = new Map((stock || []).map((s) => [s.item_id, s.stock_qty]));

  return (materials || []).map((r) => mapRawMaterialRow(r, unitNameById.get(r.unit_id) || "", stockByItemId.get(r.id) || 0));
}

export function useRawMaterials() {
  return useQuery({
    queryKey: ["raw-materials"],
    queryFn: fetchRawMaterials,
    staleTime: 30_000,
  });
}

/** Single raw material, derived from the shared list cache. */
export function useRawMaterial(id: string) {
  const { data, isLoading } = useRawMaterials();
  return { data: (data || []).find((m) => m.id === id), isLoading };
}
