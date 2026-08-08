"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapProductRow, mapBomRow, type Product } from "@/lib/types";

async function fetchProducts(): Promise<Product[]> {
  const supabase = createClient();

  const [{ data: products, error: prodError }, { data: bomRows, error: bomError }, { data: materials, error: matError }, { data: units, error: unitError }, { data: stock, error: stockError }] =
    await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("bill_of_materials").select("*"),
      supabase.from("raw_materials").select("*"),
      supabase.from("units_of_measure").select("*"),
      supabase.from("inventory_stock").select("*").eq("item_type", "product"),
    ]);
  if (prodError) throw prodError;
  if (bomError) throw bomError;
  if (matError) throw matError;
  if (unitError) throw unitError;
  if (stockError) throw stockError;

  const unitNameById = new Map((units || []).map((u) => [u.id, u.name]));
  const materialById = new Map((materials || []).map((m) => [m.id, m]));
  const stockByItemId = new Map((stock || []).map((s) => [s.item_id, s.stock_qty]));

  return (products || []).map((p) => {
    const bom = (bomRows || [])
      .filter((b) => b.product_id === p.id)
      .map((b) => {
        const material = materialById.get(b.raw_material_id);
        const unitName = material ? unitNameById.get(material.unit_id) || "" : "";
        return mapBomRow(b, material?.name || "Unknown material", unitName);
      });
    return mapProductRow(p, stockByItemId.get(p.id) || 0, bom);
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    staleTime: 30_000,
  });
}

/** Single product, derived from the shared list cache. */
export function useProduct(id: string) {
  const { data, isLoading } = useProducts();
  return { data: (data || []).find((p) => p.id === id), isLoading };
}
