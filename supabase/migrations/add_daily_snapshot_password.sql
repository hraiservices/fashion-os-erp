-- "Today's Snapshot" — a password-gated, admin-only report (src/app/(app)/reports/daily-snapshot)
-- showing just today's profit/expense/vendor-payable/net-profit, nothing else. The password is
-- a quick screen-lock for a shared/public device, not the real access control (the report is
-- already gated on viewFinancialReports) — but it still has to be a genuine secret, not just a
-- client-side string anyone could read out of the page's JS. Same reasoning and exact same
-- pattern as lockdown_anthropic_api_key_config.sql: app_settings RLS is otherwise permissive to
-- every authenticated user, so without this any logged-in staff member could read the password
-- straight out of the table. /api/reports/daily-snapshot/* (admin-gated) is the only sanctioned
-- way to read or write it, via the service-role client.

DROP POLICY IF EXISTS "block_daily_snapshot_password_select" ON app_settings;
CREATE POLICY "block_daily_snapshot_password_select" ON app_settings
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (key <> 'dailySnapshotPassword');

DROP POLICY IF EXISTS "block_daily_snapshot_password_insert" ON app_settings;
CREATE POLICY "block_daily_snapshot_password_insert" ON app_settings
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (key <> 'dailySnapshotPassword');

DROP POLICY IF EXISTS "block_daily_snapshot_password_update" ON app_settings;
CREATE POLICY "block_daily_snapshot_password_update" ON app_settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (key <> 'dailySnapshotPassword')
  WITH CHECK (key <> 'dailySnapshotPassword');

-- Seed the default password ("today") so the report works immediately without a manual setup
-- step — only inserted if nothing is there yet, so re-running this migration never clobbers a
-- password an admin has already changed via the Settings-backed API route.
INSERT INTO app_settings (key, value)
SELECT 'dailySnapshotPassword', '{"password":"today"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'dailySnapshotPassword');
