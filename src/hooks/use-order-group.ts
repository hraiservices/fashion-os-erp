"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapOrderRow, type Order } from "@/lib/types";

async function fetchOrderGroup(groupId: string): Promise<Order[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("orders").select("*").eq("group_id", groupId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapOrderRow);
}

/** Every order sharing the given group_id (see the New Order form's "one order per garment"
 *  split checkbox), the authoritative version of the approximate badges elsewhere (kanban
 *  card, orders list) that only count what's already loaded on screen. */
export function useOrderGroup(groupId: string | null) {
  return useQuery({
    queryKey: ["order-group", groupId],
    queryFn: () => fetchOrderGroup(groupId!),
    enabled: !!groupId,
  });
}
