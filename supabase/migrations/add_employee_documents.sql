-- KYC/document fields for an employee: Aadhaar/PAN numbers + images, offer/relieving/
-- resignation/experience letters (one file each, replaced on re-upload), and open-ended lists
-- of signed payslip copies and other documents. Admin-only, stricter than salary
-- (managePayroll) -- gated by literal role = 'admin' in the API routes below, not a permission
-- flag, since permission flags can be granted to a non-admin via custom_permissions. Never
-- readable by `authenticated` at all, same technique as lockdown_employee_salary_columns.sql --
-- only the service-role client (behind that admin check) ever reads or writes this data.

-- Private bucket, no `authenticated` policy at all (unlike employee-media's own scoped SELECT
-- policy) -- every read goes through a signed URL minted server-side by the admin-gated API
-- route, never a direct client fetch.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('employee-documents', 'employee-documents', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS aadhaar_number         TEXT,
  ADD COLUMN IF NOT EXISTS aadhaar_image_path      TEXT,
  ADD COLUMN IF NOT EXISTS pan_number              TEXT,
  ADD COLUMN IF NOT EXISTS pan_image_path          TEXT,
  ADD COLUMN IF NOT EXISTS offer_letter_path        TEXT,
  ADD COLUMN IF NOT EXISTS relieving_letter_path    TEXT,
  ADD COLUMN IF NOT EXISTS resignation_letter_path  TEXT,
  ADD COLUMN IF NOT EXISTS experience_letter_path   TEXT;

-- Same column-level lockdown technique as lockdown_pin_hash_columns.sql /
-- lockdown_employee_salary_columns.sql -- repeats their hidden columns too so this migration
-- is self-contained and can't hand them back by rebuilding the grant without them.
DO $$
DECLARE
  cols text;
  hidden CONSTANT text[] := ARRAY[
    'pin_hash', 'failed_pin_attempts', 'pin_locked_until',
    'salary_type', 'salary_rate', 'piece_rate_eligible',
    'aadhaar_number', 'aadhaar_image_path', 'pan_number', 'pan_image_path',
    'offer_letter_path', 'relieving_letter_path', 'resignation_letter_path', 'experience_letter_path'
  ];
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'employees'
     AND column_name <> ALL (hidden);

  IF cols IS NULL THEN
    RAISE EXCEPTION 'Could not enumerate public.employees columns — refusing to revoke SELECT';
  END IF;

  EXECUTE 'REVOKE SELECT ON public.employees FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.employees TO authenticated', cols);
END $$;

-- Open-ended document lists (signed payslip copies, "other" documents) -- each row is one
-- uploaded file plus a label. No `authenticated` policy at all, same reasoning as above.
CREATE TABLE IF NOT EXISTS employee_documents (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category      TEXT        NOT NULL CHECK (category IN ('payslip', 'other')),
  label         TEXT        NOT NULL DEFAULT '',
  storage_path  TEXT        NOT NULL,
  uploaded_by   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON employee_documents
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
