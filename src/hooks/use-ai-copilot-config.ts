"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface AiCopilotStatus {
  configured: boolean;
  usingEnvVar: boolean;
}

/** Reads/writes the geminiApiKeyConfig app_settings key through the admin-gated API route —
 *  see lockdown_gemini_api_key_config.sql for why this can't go through the generic
 *  useAppSetting() (client-side Supabase read) like every other setting does. */
export function useAiCopilotStatus() {
  return useQuery({
    queryKey: ["app-setting", "geminiApiKeyConfig", "status"],
    queryFn: async (): Promise<AiCopilotStatus> => {
      const res = await fetch("/api/settings/ai-copilot");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      return data;
    },
    staleTime: 30_000,
  });
}

export function useSaveAiCopilotApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await fetch("/api/settings/ai-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-setting", "geminiApiKeyConfig", "status"] }),
  });
}

export function useTestAiCopilotApiKey() {
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await fetch("/api/settings/ai-copilot/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The key didn't work");
    },
  });
}
