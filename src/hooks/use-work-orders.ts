"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapWorkOrderRow } from "@/lib/types";

async function fetchWorkOrders() {
  const supabase = createClient();
  const { data, error } = await supabase.from("work_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapWorkOrderRow);
}

export function useWorkOrders() {
  return useQuery({
    queryKey: ["work-orders"],
    queryFn: fetchWorkOrders,
    staleTime: 15_000,
  });
}

async function fetchWorkOrder(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("work_orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapWorkOrderRow(data) : null;
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: ["work-order", id],
    queryFn: () => fetchWorkOrder(id),
    enabled: !!id,
  });
}
