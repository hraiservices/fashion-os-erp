-- Powers the CRM customer page's Zoho-style activity timeline and the new customer photo/face
-- card.
--
-- 1. activity_log.customer_mobile — most activity_log rows are already written with an order_id
--    (stage changes, payments, rework, rename — see logAction() in src/lib/logging.ts), which the
--    new /api/customers/[mobile]/activity route can already join against orders.mobile at read
--    time with zero schema change. A handful of customer-scoped-but-not-order-scoped events
--    (profile edits, measurement profile changes, manual loyalty grants, sales invoices — which
--    carry no order_id at all) have nothing to join through, so logAction() grows an optional
--    5th parameter and the handful of call sites for those specific events now pass it. Backfill
--    is deliberately NOT done here — existing rows just won't show up in a customer's timeline,
--    same "only new activity going forward" tradeoff as every other "needs SQL" feature this
--    session (Planner, invoice email fields).
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS customer_mobile TEXT;
CREATE INDEX IF NOT EXISTS idx_activity_log_customer_mobile ON activity_log (customer_mobile) WHERE customer_mobile IS NOT NULL;

-- 2. customers.photo_path — a private Storage object path (mirrors orders.images' Storage-path
--    convention, see supabase/migrations/create_order_media_storage_bucket.sql), not a public
--    URL or inline base64. NULL means "no photo yet", in which case the UI falls back to the
--    existing letter-avatar circle.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS photo_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customer-photos', 'customer-photos', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Customers aren't tailor-scoped the way orders are (see customer_credit_balances/
-- customer_credit_ledger's own "authenticated_read ... USING (true)" policies above this one in
-- the same migration series) — any authenticated staff member who can see a customer record can
-- see their photo. Only the server (service-role client) ever writes to this bucket, same as
-- order-media — no INSERT/UPDATE/DELETE policy for `authenticated`.
DROP POLICY IF EXISTS "customer_photos_select_authenticated" ON storage.objects;
CREATE POLICY "customer_photos_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'customer-photos');
