-- Run this once in your Supabase SQL editor
-- Adds a manual Cost Price to products (separate from the BOM-derived manufacturing cost —
-- useful for products bought ready-made or when BOM costing isn't set up yet) and a default
-- Payment Terms to customers (used to prefill the due date when creating a sales invoice).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS payment_terms TEXT NOT NULL DEFAULT 'due_on_receipt';
