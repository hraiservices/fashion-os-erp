-- Fixes a real bug found in a forensic audit: the inbound WhatsApp webhook had no dedup against
-- Meta's own message id — Meta explicitly retries webhook delivery on a slow or non-2xx
-- response, and a redelivered "customer sent a message" event would re-run the concierge
-- reply logic and send the same reply to the customer a second time (see
-- api/webhooks/whatsapp/route.ts). This table lets the route claim a Meta message id exactly
-- once via INSERT ... ON CONFLICT DO NOTHING before generating/sending a reply.
CREATE TABLE IF NOT EXISTS whatsapp_inbound_dedup (
  wa_message_id TEXT PRIMARY KEY,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_inbound_dedup ENABLE ROW LEVEL SECURITY;

-- Same permissive-RLS-plus-service-role-only pattern as whatsapp_message_log — only the
-- webhook route (service role) ever touches this table.
CREATE POLICY "service_role_all" ON whatsapp_inbound_dedup
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
