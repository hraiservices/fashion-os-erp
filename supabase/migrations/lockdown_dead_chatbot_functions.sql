-- Forensic Supabase audit (2026-09-19/20): chatbot_data(), get_customers_for_chatbot(),
-- get_orders_for_chatbot(), and get_settings_for_chatbot() are SECURITY DEFINER functions that
-- exist live in this database but were never captured in a migration file (created directly via
-- the SQL Editor at some point) and had EXECUTE granted to `anon` — meaning any unauthenticated
-- request with only the public anon key could call them directly
-- (`supabase.rpc('chatbot_data')`) and receive bulk customer (mobile, name, loyalty_points,
-- measurements), order (name, mobile, status, delivery_date, total, advance, balance, garments),
-- and settings (key, value) data with no login at all.
--
-- Confirmed dead: the current AI Copilot chatbot (src/app/api/chatbot/route.ts) reads
-- `customers`/`orders` directly through createServiceClient() from an authenticated, permission-
-- checked API route — it does not call any of these four functions, and grepping the entire
-- application source turns up zero references to any of them. enable_chatbot_access() (the
-- function that originally granted this access) was already revoked from anon/authenticated in
-- an earlier pass of this same audit; these four are what it left behind.
--
-- Fix: revoke EXECUTE from anon and authenticated. Left owned by postgres and still present
-- (not dropped) since dropping requires positively confirming nothing else references them and
-- that hasn't been done here — revoking access is the minimal, reversible fix for the actual
-- risk (unauthenticated bulk data exposure), and matches the pattern already used for
-- enable_chatbot_access(), set_module_entitlements(), set_tailor_rates(), etc.

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY['chatbot_data()', 'get_customers_for_chatbot()', 'get_orders_for_chatbot()', 'get_settings_for_chatbot()'];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND (p.proname || '()') = fn
    ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, authenticated, public', fn);
    END IF;
  END LOOP;
END $$;

-- Same audit also found app_settings had SELECT/INSERT/UPDATE blocked for its five sensitive
-- keys (anthropicApiKeyConfig, geminiApiKeyConfig, whatsappCloudApiConfig, tailorRates,
-- moduleEntitlements) but no equivalent DELETE block — any authenticated user could
-- `supabase.from('app_settings').delete().eq('key','whatsappCloudApiConfig')` and destroy that
-- row (not a leak, but a real denial-of-service on the WhatsApp/AI integrations, tailor pay
-- rates, or module licensing). Closing that gap for parity with the existing SELECT/INSERT/UPDATE
-- policies.

DROP POLICY IF EXISTS "block_anthropic_api_key_delete" ON app_settings;
CREATE POLICY "block_anthropic_api_key_delete" ON app_settings
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (key <> 'anthropicApiKeyConfig');

DROP POLICY IF EXISTS "block_gemini_api_key_delete" ON app_settings;
CREATE POLICY "block_gemini_api_key_delete" ON app_settings
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (key <> 'geminiApiKeyConfig');

DROP POLICY IF EXISTS "block_whatsapp_cloud_api_delete" ON app_settings;
CREATE POLICY "block_whatsapp_cloud_api_delete" ON app_settings
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (key <> 'whatsappCloudApiConfig');

DROP POLICY IF EXISTS "block_tailor_rates_direct_delete" ON app_settings;
CREATE POLICY "block_tailor_rates_direct_delete" ON app_settings
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (key <> 'tailorRates');

DROP POLICY IF EXISTS "block_module_entitlements_direct_delete" ON app_settings;
CREATE POLICY "block_module_entitlements_direct_delete" ON app_settings
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (key <> 'moduleEntitlements');
