-- Add extended profile fields to the customers table.
-- Run this in your Supabase SQL editor.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email       text,
  ADD COLUMN IF NOT EXISTS dob         date,        -- date of birth
  ADD COLUMN IF NOT EXISTS anniversary date,        -- wedding / other anniversary
  ADD COLUMN IF NOT EXISTS address     text;
