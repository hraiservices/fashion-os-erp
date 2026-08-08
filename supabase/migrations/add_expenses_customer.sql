-- Run this once in your Supabase SQL editor
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS customer_mobile TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT;
