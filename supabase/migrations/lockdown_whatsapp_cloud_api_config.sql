-- app_settings RLS is permissive for every key except 'tailorRates'/'moduleEntitlements'
-- (add_tailor_rates_lockdown.sql, add_module_entitlements.sql), which are compensation/
-- licensing data with dedicated write-blocking policies. 'whatsappCloudApiConfig' stores a
-- live Meta WhatsApp Business Cloud API access token in PLAINTEXT (src/lib/whatsapp-cloud-api.ts)
-- and had no such protection — any authenticated user, any role, could read a usable API
-- credential straight out of the table (`supabase.from('app_settings').select('value')
-- .eq('key','whatsappCloudApiConfig')`) or overwrite it. Unlike the other two locked-down
-- keys, this one needs its READ blocked too, not just writes — confidentiality of the token
-- itself is the point, not just tamper-protection. /api/settings/whatsapp-cloud-api (new,
-- admin-gated) is now the only sanctioned way to read or write it, via the service-role client.

DROP POLICY IF EXISTS "block_whatsapp_cloud_api_select" ON app_settings;
CREATE POLICY "block_whatsapp_cloud_api_select" ON app_settings
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (key <> 'whatsappCloudApiConfig');

DROP POLICY IF EXISTS "block_whatsapp_cloud_api_insert" ON app_settings;
CREATE POLICY "block_whatsapp_cloud_api_insert" ON app_settings
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (key <> 'whatsappCloudApiConfig');

DROP POLICY IF EXISTS "block_whatsapp_cloud_api_update" ON app_settings;
CREATE POLICY "block_whatsapp_cloud_api_update" ON app_settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (key <> 'whatsappCloudApiConfig')
  WITH CHECK (key <> 'whatsappCloudApiConfig');
