"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapRawMaterialRow, type RawMaterial } from "@/lib/types";
import { fetchUnits, UNITS_QUERY_KEY } from "@/hooks/use-units";

export const RAW_MATERIAL_ROWS_QUERY_KEY = ["raw-material-rows"];

/** Exported so use-products.ts can fetch the plain raw_materials rows through the SAME query
 *  key — see the identical reasoning on fetchUnits in use-units.ts. */
export async function fetchRawMaterialRows() {
  const supabase = createClient();
  const { data, error } = await supabase.from("raw_materials").select("*").order("name");
  if (error) throw error;
  return data || [];
}

async function fetchRawMaterials(qc: QueryClient): Promise<RawMaterial[]> {
  const supabase = createClient();

  const [materials, units, { data: stock, error: stockError }] = await Promise.all([
    qc.fetchQuery({ queryKey: RAW_MATERIAL_ROWS_QUERY_KEY, queryFn: fetchRawMaterialRows, staleTime: 30_000 }),
    qc.fetchQuery({ queryKey: UNITS_QUERY_KEY, queryFn: fetchUnits, staleTime: 60_000 }),
    supabase.from("inventory_stock").select("*").eq("item_type", "raw_material"),
  ]);
  if (stockError) throw stockError;

  const unitNameById = new Map(units.map((u) => [u.id, u.name]));
  const stockByItemId = new Map((stock || []).map((s) => [s.item_id, s.stock_qty]));

  return materials.map((r) => mapRawMaterialRow(r, unitNameById.get(r.unit_id) || "", stockByItemId.get(r.id) || 0));
}

export function useRawMaterials() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["raw-materials"],
    queryFn: () => fetchRawMaterials(qc),
    staleTime: 30_000,
  });
}

/** Single raw material, derived from the shared list cache. */
export function useRawMaterial(id: string) {
  const { data, isLoading } = useRawMaterials();
  return { data: (data || []).find((m) => m.id === id), isLoading };
}
