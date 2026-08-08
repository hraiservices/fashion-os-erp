"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapCustomerRow } from "@/lib/types";

async function fetchCustomers() {
  const supabase = createClient();
  const { data, error } = await supabase.from("customers").select("*");
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
