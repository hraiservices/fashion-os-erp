-- Lets an admin edit the "What can each role do?" reference table itself (Settings > Users) so
-- the checkmarks shown there become the ACTUAL starting permissions for that role, shop-wide —
-- previously that table was read-only documentation of the hardcoded ROLE_DEFAULTS matrix in
-- lib/permissions.ts, and the only way to change what a role could do was overriding one person
-- at a time in custom_permissions.
--
-- This is exactly as security-sensitive as tailorRates (a piece-rate tailor inflating their own
-- pay) or worse: this literally controls what "sales"/"tailor" can do app-wide, so it gets the
-- exact same treatment from the start (see lockdown_set_tailor_rates_rpc.sql for why granting
-- EXECUTE to `authenticated` was a live privilege-escalation hole there) — EXECUTE goes straight
-- to service_role only, never authenticated, and the one legitimate caller
-- (/api/settings/role-defaults) checks manageUsers before ever touching the service client.

CREATE OR REPLACE FUNCTION set_role_default_overrides(p_value JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO app_settings (key, value) VALUES ('roleDefaultOverrides', p_value)
  ON CONFLICT (key) DO UPDATE SET value = p_value;
END;
$$;

GRANT EXECUTE ON FUNCTION set_role_default_overrides(JSONB) TO service_role;

DROP POLICY IF EXISTS "block_role_default_overrides_direct_write" ON app_settings;
CREATE POLICY "block_role_default_overrides_direct_write" ON app_settings
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (key <> 'roleDefaultOverrides');

DROP POLICY IF EXISTS "block_role_default_overrides_direct_update" ON app_settings;
CREATE POLICY "block_role_default_overrides_direct_update" ON app_settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (key <> 'roleDefaultOverrides')
  WITH CHECK (key <> 'roleDefaultOverrides');
