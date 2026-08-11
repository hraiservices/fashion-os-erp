-- Module licensing write-guard. Reads of the `moduleEntitlements` app_settings row go through
-- the normal permissive read path (useAppSetting, like every other setting). Writes must go
-- through this SECURITY DEFINER RPC instead of a direct upsert, so a shop's own admin cannot
-- re-enable a module they weren't sold by editing the row via browser dev tools/direct API
-- calls — only the platform owner's login email is allowed to succeed.
--
-- IMPORTANT: replace 'OWNER_EMAIL_PLACEHOLDER' below with the real platform-owner login email
-- (the same address you put in NEXT_PUBLIC_SUPER_ADMIN_EMAIL) before running this in a
-- customer's Supabase project.
CREATE OR REPLACE FUNCTION set_module_entitlements(p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(auth.jwt()->>'email', '')) <> lower('OWNER_EMAIL_PLACEHOLDER') THEN
    RAISE EXCEPTION 'Not authorized to change module entitlements';
  END IF;

  INSERT INTO app_settings (key, value) VALUES ('moduleEntitlements', p_value)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END;
$$;

GRANT EXECUTE ON FUNCTION set_module_entitlements(jsonb) TO authenticated;
