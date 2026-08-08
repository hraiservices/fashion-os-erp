-- Run this once in your Supabase SQL editor
-- Deepens the Sales Invoice document: a Subject line, shipping charges, an overall
-- discount, a computed round-off, a lightweight Draft/Sent status (independent of payment
-- status — invoice creation still deducts stock immediately, this is purely "have I sent
-- this to the customer yet"), and a per-invoice Terms & Conditions block.

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS subject          TEXT          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_charges NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type    TEXT          NOT NULL DEFAULT 'flat' CHECK (discount_type IN ('flat', 'percent')),
  ADD COLUMN IF NOT EXISTS discount_value   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off        NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doc_status       TEXT          NOT NULL DEFAULT 'draft' CHECK (doc_status IN ('draft', 'sent')),
  ADD COLUMN IF NOT EXISTS terms            TEXT          NOT NULL DEFAULT '';
