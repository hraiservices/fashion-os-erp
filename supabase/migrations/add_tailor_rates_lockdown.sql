-- Tailor payable rates are compensation data (staff could inflate their own pay by editing
-- them), unlike the customer rate card which is open to anyone who prices garments. Mirrors
-- the exact pattern already used for moduleEntitlements (fix_business_logic_bugs.sql C-6):
-- a SECURITY DEFINER RPC for the write, and a RESTRICTIVE policy blocking the plain
-- app_settings upsert any authenticated client could otherwise call directly. Same known,
-- accepted limitation as that precedent -- the RPC itself has no in-SQL permission check (this
-- app's role/permission resolution lives in TypeScript, not mirrored in SQL), so it relies on
-- only ever being invoked from the managePayroll-gated server route
-- (/api/settings/tailor-rates), not called directly. Going further would mean duplicating the
-- whole resolvePerms() matrix in plpgsql, which nothing else in this codebase does either.

CREATE OR REPLACE FUNCTION set_tailor_rates(p_value JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO app_settings (key, value) VALUES ('tailorRates', p_value)
  ON CONFLICT (key) DO UPDATE SET value = p_value;
END;
$$;

GRANT EXECUTE ON FUNCTION set_tailor_rates(JSONB) TO authenticated;

DROP POLICY IF EXISTS "block_tailor_rates_direct_write" ON app_settings;
CREATE POLICY "block_tailor_rates_direct_write" ON app_settings
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (key <> 'tailorRates');

DROP POLICY IF EXISTS "block_tailor_rates_direct_update" ON app_settings;
CREATE POLICY "block_tailor_rates_direct_update" ON app_settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (key <> 'tailorRates')
  WITH CHECK (key <> 'tailorRates');
