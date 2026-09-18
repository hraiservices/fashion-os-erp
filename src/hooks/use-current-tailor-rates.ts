"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { TailorRateCard } from "@/lib/business-rules";

/**
 * The tailor rate card actually in effect today — resolved live from tailor_rate_versions
 * (add_tailor_rate_versions.sql) via current_tailor_rates(), not a cached app_settings value.
 * A scheduled rate change (see the "Select the date from which these updates will apply" step
 * in the Settings tailor-rates UI) shows up here the instant its effective date arrives, with no
 * cache to go stale across midnight.
 */
export function useCurrentTailorRates(fallback: TailorRateCard) {
  return useQuery({
    queryKey: ["current-tailor-rates"],
    queryFn: async (): Promise<TailorRateCard> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("current_tailor_rates");
      if (error || data == null) return fallback;
      return { ...fallback, ...(data as object) } as TailorRateCard;
    },
    staleTime: 30_000,
  });
}
