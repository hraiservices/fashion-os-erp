-- Product-media Storage migration (same "stop the bleeding" pattern as
-- create_order_media_storage_bucket.sql, applied here to product photos): new/edited product
-- photos are written to a private Supabase Storage bucket instead of as a base64 data URL
-- inline in products.image_data_url.
--
-- Existing products are NOT touched -- only a product created or saved from here on migrates
-- its photo.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-media', 'product-media', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Read access mirrors the products table's whole-table permission gate exactly
-- (optimize_rls_function_calls.sql) -- whoever can see the product catalog can see its photos.
-- Only the server (service-role client, which bypasses RLS -- see
-- src/lib/supabase/service.ts) ever writes to this bucket, so there is deliberately no
-- INSERT/UPDATE/DELETE policy for `authenticated` here.
DROP POLICY IF EXISTS "product_media_select_scoped" ON storage.objects;
CREATE POLICY "product_media_select_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-media'
    AND (
      (SELECT public.has_perm('manageInventory'))
      OR (SELECT public.has_perm('manageSales'))
      OR (SELECT public.has_perm('usePOS'))
      OR (SELECT public.has_perm('managePurchases'))
    )
  );
