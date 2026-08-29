-- Run this once in your Supabase SQL editor, after add_whatsapp_send_log_and_opt_out.sql.
--
-- Fixes a bug: whatsapp_message_log's RLS only granted INSERT to service_role, but several
-- routes that log a send (order advance-stage's "ready" nudge, the product recommendation
-- send, and the new broadcast route) run as the logged-in staff member's own session client,
-- not the service role. Without this, every one of their logWhatsAppSend() calls silently
-- fails RLS and never appears in the Settings > WhatsApp send log (caught and swallowed, so it
-- doesn't break the actual send — just the audit trail for it).

CREATE POLICY "Authenticated can insert whatsapp_message_log" ON whatsapp_message_log FOR INSERT TO authenticated WITH CHECK (true);
