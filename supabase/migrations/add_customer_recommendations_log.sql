-- Phase 6 of Customer Purchase Intelligence: append-only log of every product recommendation
-- sent to a customer. Used for (a) anti-spam cooldown -- refuse to re-suggest the same
-- product to the same customer within a configurable window, (b) dedup visibility in the UI,
-- and (c) Phase 8 analytics (recommendations sent -> orders attributed).

CREATE TABLE IF NOT EXISTS customer_recommendations (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_mobile TEXT          NOT NULL,
  customer_name   TEXT          NOT NULL DEFAULT '',
  product_id      UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name    TEXT          NOT NULL DEFAULT '',
  score           INTEGER       NOT NULL DEFAULT 0,
  -- 'wa_me' = manual click-to-chat composer opened (this shop has no Business API configured
  -- yet). 'whatsapp_api' = sent programmatically via the WhatsApp Business Cloud API.
  channel         TEXT          NOT NULL DEFAULT 'wa_me' CHECK (channel IN ('wa_me', 'whatsapp_api')),
  message         TEXT          NOT NULL DEFAULT '',
  created_by      TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_recommendations_lookup
  ON customer_recommendations (customer_mobile, product_id, created_at DESC);

ALTER TABLE customer_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON customer_recommendations FOR ALL TO authenticated USING (true) WITH CHECK (true);
