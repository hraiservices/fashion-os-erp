-- Expense module redesign: a receipt photo, an optional vendor name (free text — most expenses
-- here aren't paid to a full Vendor record, just "Petty Cash" / a one-off supplier), and an
-- optional payment reference number (cheque/UPI txn id), matching the fields Zoho's Expense
-- detail shows.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS vendor_name      TEXT,
  ADD COLUMN IF NOT EXISTS receipt_path     TEXT;

-- Private bucket, no `authenticated` policy at all — the expenses module is already entirely
-- server-API-mediated (see src/app/api/expenses/*), never a direct client Supabase query, so
-- every receipt read is a signed URL minted server-side in that same GET route rather than a
-- client-side Storage fetch. Same "no authenticated policy" technique as
-- create_employee_media_storage_bucket.sql's employee-documents bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('expense-receipts', 'expense-receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
