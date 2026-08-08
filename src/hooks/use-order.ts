"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapOrderRow } from "@/lib/types";

async function fetchOrder(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapOrderRow(data) : null;
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder(id),
    enabled: !!id,
  });
}
