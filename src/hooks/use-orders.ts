"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapOrderRow, type Order } from "@/lib/types";

async function fetchOrders(): Promise<Order[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapOrderRow);
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    staleTime: 30_000,
  });
}
