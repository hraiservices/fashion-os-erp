"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { getLoyaltyConfig } from "@/lib/settings";

export function useLoyaltyConfig() {
  return useQuery({
    queryKey: ["loyalty-config"],
    queryFn: () => getLoyaltyConfig(createClient()),
    staleTime: 5 * 60_000,
  });
}
