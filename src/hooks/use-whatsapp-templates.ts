"use client";

import { useQuery } from "@tanstack/react-query";
import type { WhatsAppTemplateSummary } from "@/lib/whatsapp-cloud-api";

/** Fetches this shop's approved Meta message templates through the admin-gated route (the
 *  access token can't be read client-side — same reason useWhatsAppCloudApiConfig exists).
 *  Disabled by default: only worth calling once wabaId/accessToken are actually saved, and it's
 *  a live external API call, not something to fire on every settings-page mount. */
export function useWhatsAppTemplates(enabled: boolean) {
  return useQuery<WhatsAppTemplateSummary[]>({
    queryKey: ["whatsapp-templates"],
    queryFn: async () => {
      const res = await fetch("/api/settings/whatsapp-cloud-api/templates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't fetch templates");
      return data.templates;
    },
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
