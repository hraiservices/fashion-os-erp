"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPurchaseOrderRow } from "@/lib/types";

async function fetchPurchaseOrders() {
  const supabase = createClient();
  const { data, error } = await supabase.from("purchase_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapPurchaseOrderRow);
}

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["purchase-orders"],
    queryFn: fetchPurchaseOrders,
    staleTime: 30_000,
  });
}

async function fetchPurchaseOrder(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("purchase_orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapPurchaseOrderRow(data) : null;
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => fetchPurchaseOrder(id),
    enabled: !!id,
  });
}
