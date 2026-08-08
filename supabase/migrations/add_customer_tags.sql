-- Run this once in your Supabase SQL editor
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
