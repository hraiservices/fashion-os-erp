"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapVendorRow } from "@/lib/types";

async function fetchVendors() {
  const supabase = createClient();
  const { data, error } = await supabase.from("vendors").select("*").order("name");
  if (error) throw error;
  return (data || []).map(mapVendorRow);
}

export function useVendors() {
  return useQuery({
    queryKey: ["vendors"],
    queryFn: fetchVendors,
    staleTime: 30_000,
  });
}

async function fetchVendor(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("vendors").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapVendorRow(data) : null;
}

export function useVendor(id: string) {
  return useQuery({
    queryKey: ["vendor", id],
    queryFn: () => fetchVendor(id),
    enabled: !!id,
  });
}
