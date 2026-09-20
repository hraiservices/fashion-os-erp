-- Order-media Storage migration, Phase 1 ("stop the bleeding"): new order photos are written to
-- a private Supabase Storage bucket instead of as raw base64 data URLs inline in orders.images.
--
-- Confirmed via live diagnostics (supabase/audit/media_storage_diagnostic.sql, run against
-- production): `images` alone accounts for ~6.79MB of the orders table's ~8.8MB TOAST bloat
-- (74%, present on 51/64 orders) -- audios/videos are 0 bytes across every current order, so
-- this migration is deliberately scoped to images only. The identical pattern (see
-- src/lib/supabase/media-storage.ts) extends to audio/video the moment those are actually used.
--
-- orders.images stays a text[] column -- each element is now either a Storage object path
-- ("<order_id>/<uuid>.jpg") for anything saved after this ships, or a legacy base64 data: URL
-- for anything saved before it. Existing orders are NOT backfilled here -- that's Phase 2, a
-- deliberate follow-up once Phase 1 is verified safe in production.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('order-media', 'order-media', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Read access mirrors "orders_select_scoped" (optimize_rls_function_calls.sql) exactly --
-- whoever can see an order can see its photos, nobody else. Only the server (service-role
-- client, which bypasses RLS entirely -- see src/lib/supabase/service.ts) ever writes to this
-- bucket, so there is deliberately no INSERT/UPDATE/DELETE policy for `authenticated` here.
DROP POLICY IF EXISTS "order_media_select_scoped" ON storage.objects;
CREATE POLICY "order_media_select_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'order-media'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = (storage.foldername(storage.objects.name))[1]
        AND (
          (SELECT public.is_back_office())
          OR (SELECT public.has_perm('manageSales'))
          OR (SELECT public.has_perm('addOrder'))
          OR COALESCE(o.tailor, '') = ''
          OR o.tailor = (SELECT public.current_employee_id())::text
          OR (
            (SELECT public.current_employee_id()) IS NOT NULL
            AND o.garments @> jsonb_build_array(jsonb_build_object('tailor', (SELECT public.current_employee_id())::text))
          )
        )
    )
  );
