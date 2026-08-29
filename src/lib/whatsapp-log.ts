import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type WhatsAppMessageType = "concierge_reply" | "ready_nudge" | "daily_briefing" | "payment_reminder" | "recommendation" | "sales_template";
export type WhatsAppMessageStatus = "sent" | "delivered" | "read" | "failed";

/** Records one WhatsApp send attempt — called right after every sendWhatsApp* call, success or
 *  failure, so Settings → WhatsApp's send log shows the whole picture. Never throws: a logging
 *  failure must not turn an otherwise-successful send into an error for the caller. */
export async function logWhatsAppSend(
  supabase: SupabaseClient<Database>,
  params: { messageType: WhatsAppMessageType; toMobile: string; waMessageId?: string | null; status: WhatsAppMessageStatus; error?: string }
): Promise<void> {
  try {
    await supabase.from("whatsapp_message_log").insert({
      message_type: params.messageType,
      to_mobile: params.toMobile,
      wa_message_id: params.waMessageId ?? null,
      status: params.status,
      error: params.error ?? null,
    });
  } catch (e) {
    console.error("Failed to write whatsapp_message_log row:", e);
  }
}

/** Updates a logged send's status as Meta reports delivery/read receipts back via the webhook's
 *  `statuses` payload — matched by Meta's own message id, not our row id. */
export async function updateWhatsAppStatus(supabase: SupabaseClient<Database>, waMessageId: string, status: WhatsAppMessageStatus): Promise<void> {
  try {
    await supabase.from("whatsapp_message_log").update({ status, updated_at: new Date().toISOString() }).eq("wa_message_id", waMessageId);
  } catch (e) {
    console.error("Failed to update whatsapp_message_log status:", e);
  }
}
