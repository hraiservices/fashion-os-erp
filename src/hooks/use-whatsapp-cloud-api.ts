"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";

/** Reads/writes the whatsappCloudApiConfig app_settings key through the admin-gated API route —
 *  see lockdown_whatsapp_cloud_api_config.sql for why this can't go through the generic
 *  useAppSetting() (client-side Supabase read) like every other setting does. */
export function useWhatsAppCloudApiConfig(fallback: WhatsAppCloudApiConfig) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["app-setting", "whatsappCloudApiConfig"],
    queryFn: async (): Promise<WhatsAppCloudApiConfig> => {
      const res = await fetch("/api/settings/whatsapp-cloud-api");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      return data.value ? { ...fallback, ...data.value } : fallback;
    },
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async (value: WhatsAppCloudApiConfig) => {
      const res = await fetch("/api/settings/whatsapp-cloud-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      return value;
    },
    onSuccess: (value) => {
      qc.setQueryData(["app-setting", "whatsappCloudApiConfig"], value);
    },
  });

  return { ...query, save };
}
