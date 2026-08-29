"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface WhatsAppMessageLogRow {
  id: string;
  messageType: string;
  toMobile: string;
  waMessageId: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Most recent 100 WhatsApp send attempts — read directly (whatsapp_message_log's RLS permits
 *  any authenticated read, same pattern as chatbot_messages; the real access gate is this
 *  page living under the admin-only Settings > WhatsApp screen). */
export function useWhatsAppMessageLog() {
  return useQuery({
    queryKey: ["whatsapp-message-log"],
    queryFn: async (): Promise<WhatsAppMessageLogRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("whatsapp_message_log").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        messageType: r.message_type,
        toMobile: r.to_mobile,
        waMessageId: r.wa_message_id,
        status: r.status,
        error: r.error,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },
    staleTime: 15_000,
  });
}
