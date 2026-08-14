"use client";

import { useMutation } from "@tanstack/react-query";

interface RecommendInput {
  mobile: string;
  customerName: string;
  productId: string;
  productName: string;
  category?: string;
  price?: number;
  score?: number;
}

interface RecommendResult {
  blocked: boolean;
  waUrl?: string;
  message?: string;
  lastSentAt?: string;
  cooldownDays?: number;
  /** True if sent directly via the WhatsApp Business Cloud API — no composer tab to open. */
  sentViaApi?: boolean;
}

/** Calls POST /api/customers/recommend (cooldown check + audit log), then opens the wa.me
 *  composer in a new tab if it wasn't blocked. See that route for the anti-spam rules. */
export function useSendRecommendation() {
  return useMutation({
    mutationFn: async (input: RecommendInput): Promise<RecommendResult> => {
      const res = await fetch("/api/customers/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(data.error || "Failed to send");
      if (data.waUrl) window.open(data.waUrl, "_blank", "noopener,noreferrer");
      return data;
    },
  });
}
