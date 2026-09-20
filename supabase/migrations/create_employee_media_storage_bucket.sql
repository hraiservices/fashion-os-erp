-- Employee-media Storage migration (same "stop the bleeding" pattern as
-- create_order_media_storage_bucket.sql, applied here to attendance selfies): new check-in/
-- check-out photos are written to a private Supabase Storage bucket instead of as base64 data
-- URLs inline in employee_attendance.check_in_photo / check_out_photo.
--
-- Existing attendance rows are NOT touched -- only new/edited (well, only new, since these
-- columns are never edited after the fact) check-ins and check-outs go through Storage from
-- here on.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('employee-media', 'employee-media', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Read access mirrors the employee_attendance row policy exactly (own row, or manageEmployees --
-- see optimize_rls_function_calls.sql). The object path is "<employee_id>/<uuid>.jpg", so the
-- policy can check the folder directly with no join back to employee_attendance needed. Only
-- the server (service-role client, which bypasses RLS -- see src/lib/supabase/service.ts) ever
-- writes to this bucket, so there is deliberately no INSERT/UPDATE/DELETE policy for
-- `authenticated` here.
DROP POLICY IF EXISTS "employee_media_select_scoped" ON storage.objects;
CREATE POLICY "employee_media_select_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-media'
    AND (
      (storage.foldername(storage.objects.name))[1] = (SELECT public.current_employee_id())::text
      OR (SELECT public.has_perm('manageEmployees'))
    )
  );
