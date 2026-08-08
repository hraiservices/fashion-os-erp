"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapCustomerRow } from "@/lib/types";

async function fetchCustomerByMobile(mobile: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("customers").select("*").eq("mobile", mobile).maybeSingle();
  if (error) throw error;
  return data ? mapCustomerRow(data) : null;
}

export function useCustomerByMobile(mobile: string) {
  return useQuery({
    queryKey: ["customer-by-mobile", mobile],
    queryFn: () => fetchCustomerByMobile(mobile),
    enabled: !!mobile,
  });
}
