-- Same reasoning as lockdown_gemini_api_key_config.sql: 'anthropicApiKeyConfig' now stores a
-- live Claude (Anthropic) API key in PLAINTEXT (src/lib/anthropic-config.ts, the fallback the
-- AI Copilot's Q&A engine uses when ANTHROPIC_API_KEY isn't set as an env var) — app_settings
-- RLS is otherwise permissive, so without this any authenticated user, any role, could read the
-- key straight out of the table or overwrite it.
-- /api/settings/ai-copilot/claude (admin-gated) is the only sanctioned way to read or write it,
-- via the service-role client.

DROP POLICY IF EXISTS "block_anthropic_api_key_select" ON app_settings;
CREATE POLICY "block_anthropic_api_key_select" ON app_settings
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (key <> 'anthropicApiKeyConfig');

DROP POLICY IF EXISTS "block_anthropic_api_key_insert" ON app_settings;
CREATE POLICY "block_anthropic_api_key_insert" ON app_settings
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (key <> 'anthropicApiKeyConfig');

DROP POLICY IF EXISTS "block_anthropic_api_key_update" ON app_settings;
CREATE POLICY "block_anthropic_api_key_update" ON app_settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (key <> 'anthropicApiKeyConfig')
  WITH CHECK (key <> 'anthropicApiKeyConfig');
