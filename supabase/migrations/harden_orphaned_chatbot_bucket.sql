-- Forensic Supabase audit (2026-09-19/20): the 'chatbot' storage bucket is public (world-
-- readable URLs), has no file_size_limit and no allowed_mime_types, and any authenticated user
-- can INSERT into it (chatbot_storage_insert policy). Confirmed via `grep -rn "\.storage\."`
-- across the entire application source: NOTHING in the current codebase reads from or writes to
-- Supabase Storage at all -- every image feature in this app (products, employees, garments)
-- stores base64 data URLs directly in Postgres columns instead. This bucket is orphaned
-- infrastructure, same pattern as the four dead chatbot RPC functions found earlier in this
-- audit, and as configured it is usable as free, anonymous, unlimited-size public file hosting
-- on this project's domain by any authenticated user.
--
-- Fix: restrict to a reasonable size limit and MIME allowlist (images/audio -- consistent with
-- what a "chatbot" bucket would plausibly have been for: photo or voice-note attachments) as
-- defense-in-depth regardless of current usage, and flip the bucket to private now that nothing
-- in the app depends on its URLs being publicly fetchable without a signed URL.

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 10485760, -- 10 MiB
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/webm']
WHERE id = 'chatbot';

-- The public SELECT policy is now moot once the bucket itself is private (Supabase enforces
-- bucket-level public/private before RLS is even consulted for unsigned URLs), but drop it
-- anyway so `pg_policies` doesn't keep advertising unauthenticated read access that no longer
-- does anything -- a future person reading policies shouldn't have to know that fact to reason
-- about this table correctly.
DROP POLICY IF EXISTS "chatbot_storage_read" ON storage.objects;
CREATE POLICY "chatbot_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chatbot');
