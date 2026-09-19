"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface ClaudeCopilotStatus {
  configured: boolean;
  usingEnvVar: boolean;
}

/** Reads/writes the anthropicApiKeyConfig app_settings key through the admin-gated API route —
 *  mirrors use-ai-copilot-config.ts exactly, for the Claude key the Copilot's Q&A engine
 *  actually runs on now (src/lib/chatbot/claude.ts). */
export function useClaudeCopilotStatus() {
  return useQuery({
    queryKey: ["app-setting", "anthropicApiKeyConfig", "status"],
    queryFn: async (): Promise<ClaudeCopilotStatus> => {
      const res = await fetch("/api/settings/ai-copilot/claude");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      return data;
    },
    staleTime: 30_000,
  });
}

export function useSaveClaudeCopilotApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await fetch("/api/settings/ai-copilot/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-setting", "anthropicApiKeyConfig", "status"] }),
  });
}

export function useTestClaudeCopilotApiKey() {
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await fetch("/api/settings/ai-copilot/claude/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The key didn't work");
    },
  });
}
