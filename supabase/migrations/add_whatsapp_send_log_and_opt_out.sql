-- Run this once in your Supabase SQL editor.
--
-- Two additions for the WhatsApp feature set:
-- 1. customers.whatsapp_opt_out -- a customer who's asked not to be messaged. Checked before
--    every PROACTIVE (shop-initiated) send: the ready-for-pickup nudge, payment reminders,
--    product recommendations. NOT checked for the order-status concierge, since that only ever
--    replies to a message the customer sent first.
-- 2. whatsapp_message_log -- records every automated WhatsApp send attempt (type, recipient,
--    Meta's message id, status) so the shop can actually see what succeeded/failed instead of
--    only finding out from a confused customer. The webhook (src/app/api/webhooks/whatsapp)
--    updates a row's status to delivered/read as Meta reports it back.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'concierge_reply' | 'ready_nudge' | 'daily_briefing' | 'payment_reminder' | 'recommendation' | 'sales_template'
  message_type text NOT NULL,
  to_mobile text NOT NULL,
  -- Meta's wamid — null when the send failed before Meta ever accepted it (no id to track).
  wa_message_id text,
  -- 'sent' | 'delivered' | 'read' | 'failed'
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_message_log_wa_message_id_idx ON whatsapp_message_log (wa_message_id);
CREATE INDEX IF NOT EXISTS whatsapp_message_log_type_mobile_created_idx ON whatsapp_message_log (message_type, to_mobile, created_at DESC);

ALTER TABLE whatsapp_message_log ENABLE ROW LEVEL SECURITY;

-- Same permissive-RLS-plus-app-level-gating pattern as chatbot_messages/admin_notifications —
-- the real access control is the admin-only Settings > WhatsApp page. Only the service role
-- (used by the cron routes and the status webhook, both unauthenticated) writes to this table.
CREATE POLICY "Authenticated can read whatsapp_message_log" ON whatsapp_message_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage whatsapp_message_log" ON whatsapp_message_log FOR ALL TO service_role USING (true) WITH CHECK (true);
