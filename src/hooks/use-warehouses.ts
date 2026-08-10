"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapWarehouseRow } from "@/lib/types";

async function fetchWarehouses() {
  const supabase = createClient();
  const { data, error } = await supabase.from("warehouses").select("*").order("name");
  if (error) throw error;
  return (data || []).map(mapWarehouseRow);
}

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: fetchWarehouses,
    staleTime: 30_000,
  });
}

async function fetchWarehouse(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("warehouses").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapWarehouseRow(data) : null;
}

export function useWarehouse(id: string) {
  return useQuery({
    queryKey: ["warehouse", id],
    queryFn: () => fetchWarehouse(id),
    enabled: !!id,
  });
}

/** Active warehouses only, for pickers (stock transfer, per-warehouse filters). */
export function useActiveWarehouses() {
  const { data: warehouses, ...rest } = useWarehouses();
  const active = (warehouses || []).filter((w) => w.active);
  return { data: active, ...rest };
}
