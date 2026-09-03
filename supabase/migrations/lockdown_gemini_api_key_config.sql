-- Same reasoning as lockdown_whatsapp_cloud_api_config.sql: 'geminiApiKeyConfig' now stores a
-- live Gemini API key in PLAINTEXT (src/lib/gemini-config.ts, the fallback AI Copilot/daily
-- briefing/voice-transcription/measurement-extraction use when GEMINI_API_KEY isn't set as an
-- env var) — app_settings RLS is otherwise permissive, so without this any authenticated user,
-- any role, could read the key straight out of the table or overwrite it.
-- /api/settings/ai-copilot (admin-gated) is the only sanctioned way to read or write it, via
-- the service-role client.

DROP POLICY IF EXISTS "block_gemini_api_key_select" ON app_settings;
CREATE POLICY "block_gemini_api_key_select" ON app_settings
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (key <> 'geminiApiKeyConfig');

DROP POLICY IF EXISTS "block_gemini_api_key_insert" ON app_settings;
CREATE POLICY "block_gemini_api_key_insert" ON app_settings
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (key <> 'geminiApiKeyConfig');

DROP POLICY IF EXISTS "block_gemini_api_key_update" ON app_settings;
CREATE POLICY "block_gemini_api_key_update" ON app_settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (key <> 'geminiApiKeyConfig')
  WITH CHECK (key <> 'geminiApiKeyConfig');
