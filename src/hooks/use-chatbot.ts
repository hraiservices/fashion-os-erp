"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ChatbotMessage {
  id: string;
  user_email: string;
  question: string;
  generated_sql: string | null;
  answer: string;
  error: string | null;
  created_at: string;
}

export function useChatbotHistory() {
  return useQuery<ChatbotMessage[]>({
    queryKey: ["chatbot-history"],
    queryFn: async () => {
      const res = await fetch("/api/chatbot");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load history");
      return data.messages as ChatbotMessage[];
    },
  });
}

export function useAskChatbot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (question: string) => {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get an answer");
      return data as {
        answer: string;
        sql: string | null;
        refs: { id: string; label: string }[];
        refTable: "orders" | "invoices" | null;
        followups: string[];
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatbot-history"] }),
  });
}

/** Starts a fresh conversation — clears this user's own history so an unrelated new question
 *  doesn't drag in stale "recent conversation" context from a much earlier topic. */
export function useClearChatbotHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/chatbot", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear conversation");
      return data as { cleared: true };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatbot-history"] }),
  });
}
