-- Run this once in your Supabase SQL editor
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;
