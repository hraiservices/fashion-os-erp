"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapProductRow, mapBomRow, type Product } from "@/lib/types";
import { fetchUnits, UNITS_QUERY_KEY } from "@/hooks/use-units";
import { fetchRawMaterialRows, RAW_MATERIAL_ROWS_QUERY_KEY } from "@/hooks/use-raw-materials";

async function fetchProducts(qc: QueryClient): Promise<Product[]> {
  const supabase = createClient();

  const [{ data: products, error: prodError }, { data: bomRows, error: bomError }, materials, units, { data: stock, error: stockError }] = await Promise.all([
    supabase.from("products").select("*").order("name"),
    supabase.from("bill_of_materials").select("*"),
    // Shared query keys with use-raw-materials.ts/use-units.ts — these two reference tables
    // were being fetched independently by every hook that needed them, which a live Supabase
    // log audit caught firing as duplicate network/DB round trips on the same page load.
    qc.fetchQuery({ queryKey: RAW_MATERIAL_ROWS_QUERY_KEY, queryFn: fetchRawMaterialRows, staleTime: 30_000 }),
    qc.fetchQuery({ queryKey: UNITS_QUERY_KEY, queryFn: fetchUnits, staleTime: 60_000 }),
    supabase.from("inventory_stock").select("*").eq("item_type", "product"),
  ]);
  if (prodError) throw prodError;
  if (bomError) throw bomError;
  if (stockError) throw stockError;

  const unitNameById = new Map(units.map((u) => [u.id, u.name]));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const stockByItemId = new Map((stock || []).map((s) => [s.item_id, s.stock_qty]));
  // Grouped once, the way stock and units above already are. Re-filtering the whole BOM table
  // inside the per-product map made this quadratic — 1,000 products against 5,000 BOM rows is
  // 5 million comparisons on the main thread, every time the products query runs.
  const bomByProductId = new Map<string, typeof bomRows>();
  for (const b of bomRows || []) {
    const list = bomByProductId.get(b.product_id) || [];
    list.push(b);
    bomByProductId.set(b.product_id, list);
  }

  return (products || []).map((p) => {
    const bom = (bomByProductId.get(p.id) || [])
      .map((b) => {
        const material = materialById.get(b.raw_material_id);
        const unitName = material ? unitNameById.get(material.unit_id) || "" : "";
        return mapBomRow(b, material?.name || "Unknown material", unitName);
      });
    return mapProductRow(p, stockByItemId.get(p.id) || 0, bom);
  });
}

/**
 * `enabled` exists for the topbar search box, which is mounted on every page and used on
 * almost none of them: it holds these record hooks off until someone actually types, instead
 * of pulling whole tables down on every single page load. Every other caller wants the data
 * immediately and leaves it alone.
 */
export function useProducts(enabled = true) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(qc),
    staleTime: 30_000,
    enabled,
  });
}

/** Single product, derived from the shared list cache. */
export function useProduct(id: string) {
  const { data, isLoading } = useProducts();
  return { data: (data || []).find((p) => p.id === id), isLoading };
}
