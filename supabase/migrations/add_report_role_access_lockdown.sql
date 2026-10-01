-- Run this once in Supabase → SQL Editor.
--
-- Per-report (not per-category) role toggles for the ~60 individual reports under Reports —
-- "View Reports" and "View Financial Reports" are too coarse once a role should see some
-- reports but not others (e.g. Sales reports but not Employee reports). Exactly as
-- security-sensitive as roleDefaultOverrides/tailorRates (it controls what an entire role can
-- see app-wide), so it gets the same treatment: EXECUTE on the write RPC goes to service_role
-- only, never authenticated, and the one legitimate caller (/api/settings/report-access) checks
-- manageUsers before ever touching the service client. Reads are NOT locked down — every user
-- needs to read this to know their own effective report access, same as roleDefaultOverrides.

CREATE OR REPLACE FUNCTION set_report_role_access(p_value JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO app_settings (key, value) VALUES ('reportRoleAccess', p_value)
  ON CONFLICT (key) DO UPDATE SET value = p_value;
END;
$$;

GRANT EXECUTE ON FUNCTION set_report_role_access(JSONB) TO service_role;

DROP POLICY IF EXISTS "block_report_role_access_direct_write" ON app_settings;
CREATE POLICY "block_report_role_access_direct_write" ON app_settings
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (key <> 'reportRoleAccess');

DROP POLICY IF EXISTS "block_report_role_access_direct_update" ON app_settings;
CREATE POLICY "block_report_role_access_direct_update" ON app_settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (key <> 'reportRoleAccess')
  WITH CHECK (key <> 'reportRoleAccess');
