"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CustomerRecommendationLog {
  id: string;
  customerMobile: string;
  customerName: string;
  productId: string;
  productName: string;
  score: number;
  channel: "wa_me" | "whatsapp_api";
  message: string;
  createdBy: string | null;
  createdAt: string;
}

/** Phase 8 analytics source: every recommendation ever sent (see Phase 6's /api/customers/recommend). */
export function useCustomerRecommendations() {
  return useQuery({
    queryKey: ["customer-recommendations"],
    queryFn: async (): Promise<CustomerRecommendationLog[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("customer_recommendations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        customerMobile: r.customer_mobile,
        customerName: r.customer_name || "",
        productId: r.product_id,
        productName: r.product_name || "",
        score: r.score || 0,
        channel: (r.channel as "wa_me" | "whatsapp_api") || "wa_me",
        message: r.message || "",
        createdBy: r.created_by,
        createdAt: r.created_at,
      }));
    },
    staleTime: 30_000,
  });
}
