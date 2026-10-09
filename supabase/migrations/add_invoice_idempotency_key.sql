-- Run this once in Supabase → SQL Editor.
--
-- POS checkout had no protection against a network drop mid-submit: the client generates a
-- random invoice number per attempt, so a retry after a timeout (not a clean error — the first
-- request may have actually succeeded) creates a SECOND invoice, deducts stock a second time,
-- and records a second payment for the same physical sale.
--
-- Fix is entirely app-side (API route + client), not a change to save_sales_invoice's signature
-- — adding a parameter there would create a second overload alongside the existing one unless
-- explicitly dropped first, the exact "could not choose the best candidate function" bug already
-- hit with edit_order this month. Instead: a nullable idempotency_key column, set via a plain
-- UPDATE right after the RPC call succeeds. The client reuses the same key across retries of one
-- checkout attempt; the API route checks for an existing invoice with that key BEFORE calling
-- the RPC at all, so a retry after a successful-but-unconfirmed first attempt returns the
-- original invoice instead of creating another one.
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Partial unique index (not a plain UNIQUE column) so every invoice created before this change,
-- and every invoice created without a key (the normal invoice-form flow never sends one), can
-- all have idempotency_key = NULL without colliding with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoices_idempotency_key
  ON sales_invoices (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
