"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapCustomerRow } from "@/lib/types";

// A growth safety net, not real pagination — see the identical comment in use-orders.ts.
const SAFETY_LIMIT = 20_000;

async function fetchCustomers() {
  const supabase = createClient();
  const { data, error } = await supabase.from("customers").select("*").limit(SAFETY_LIMIT);
  if (error) throw error;
  return (data || []).map(mapCustomerRow);
}

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
    staleTime: 30_000,
  });
}
