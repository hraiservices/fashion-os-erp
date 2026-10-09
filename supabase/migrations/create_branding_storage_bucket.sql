-- Shop branding (logo, favicon) was stored as base64 data: URLs inline in app_settings.shop's
-- JSONB value (see src/lib/image-utils.ts) instead of Supabase Storage. useShopSettings() reads
-- that row from the app shell (nav, mobile nav) on nearly every authenticated page, plus the
-- login/signup pages, the favicon route, and the OG-image route — all pre-auth, so unlike every
-- other media bucket in this project (private + signed URLs), this one needs to be public: there
-- is no logged-in session on those pages to request a signed URL with. A shop logo/favicon isn't
-- sensitive, so serving it at a public, unsigned URL is an acceptable, deliberate deviation from
-- the private-bucket convention (see create_product_media_storage_bucket.sql for that default).
--
-- Existing shops are NOT touched -- only a logo/favicon saved from here on migrates to Storage;
-- see src/lib/supabase/branding-storage.ts.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branding-media', 'branding-media', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Public bucket: reads are served at .../storage/v1/object/public/branding-media/... without any
-- RLS check, by design. Only the server (service-role client, which bypasses RLS -- see
-- src/lib/supabase/service.ts) ever writes to this bucket, so there is deliberately no
-- INSERT/UPDATE/DELETE policy for `authenticated` here, same as every other media bucket.
