"use client";

import { useMutation } from "@tanstack/react-query";

export interface BroadcastResult {
  sent: number;
  failed: number;
  total: number;
}

export function useSendBroadcast() {
  return useMutation({
    mutationFn: async ({ tags, message }: { tags: string[]; message: string }) => {
      const res = await fetch("/api/whatsapp/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Broadcast failed");
      return data as BroadcastResult;
    },
  });
}
