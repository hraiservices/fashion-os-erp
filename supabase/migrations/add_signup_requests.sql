-- Public lead-capture for the marketing site's "Sign up" link (fashionflow.app/signup). This
-- is deliberately NOT the same thing as a real account — see docs/customer-onboarding.md and
-- scripts/onboard-customer.mjs: each new shop gets its own fully separate Supabase project +
-- deployment, provisioned by the platform owner (manually or via that script), never a row
-- inside THIS shared database. A request row here is just "someone wants a shop, come set one
-- up for them" — reviewed in Settings, never auto-approved.
CREATE TABLE IF NOT EXISTS signup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  shop_name text NOT NULL,
  email text NOT NULL,
  phone text,
  note text,
  status text NOT NULL DEFAULT 'new', -- 'new' | 'contacted' | 'provisioned' | 'declined'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;

-- No direct INSERT policy for anon at all — every request goes through submit_signup_request()
-- below, so a public visitor can never read back other people's requests or write anything
-- except through that one narrow, validated path.
--
-- These leads are platform-owner business (who to sell a new deployment to), not a given shop's
-- own admin's business, so this is gated the same way as set_module_entitlements in
-- add_module_entitlements.sql — the platform-owner login email only, not has_perm('manageUsers').
--
-- IMPORTANT: replace 'OWNER_EMAIL_PLACEHOLDER' below with the real platform-owner login email
-- (the same address you put in NEXT_PUBLIC_SUPER_ADMIN_EMAIL) before running this in a
-- customer's Supabase project.
DROP POLICY IF EXISTS "signup_requests_select_manage_users" ON signup_requests;
DROP POLICY IF EXISTS "signup_requests_select_owner" ON signup_requests;
CREATE POLICY "signup_requests_select_owner" ON signup_requests
  FOR SELECT TO authenticated
  USING (lower(coalesce(auth.jwt()->>'email', '')) = lower('OWNER_EMAIL_PLACEHOLDER'));

DROP POLICY IF EXISTS "signup_requests_update_manage_users" ON signup_requests;
DROP POLICY IF EXISTS "signup_requests_update_owner" ON signup_requests;
CREATE POLICY "signup_requests_update_owner" ON signup_requests
  FOR UPDATE TO authenticated
  USING (lower(coalesce(auth.jwt()->>'email', '')) = lower('OWNER_EMAIL_PLACEHOLDER'))
  WITH CHECK (lower(coalesce(auth.jwt()->>'email', '')) = lower('OWNER_EMAIL_PLACEHOLDER'));

CREATE OR REPLACE FUNCTION submit_signup_request(p_name text, p_shop_name text, p_email text, p_phone text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  IF trim(coalesce(p_shop_name, '')) = '' THEN
    RAISE EXCEPTION 'Shop name is required';
  END IF;
  IF trim(coalesce(p_email, '')) = '' OR p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  INSERT INTO signup_requests (name, shop_name, email, phone, note)
  VALUES (trim(p_name), trim(p_shop_name), lower(trim(p_email)), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_note, '')), ''));
END;
$$;

-- anon: the public form is unauthenticated. authenticated: an already-logged-in tailor/admin
-- browsing the marketing site should be able to submit one too (e.g. referring another shop).
GRANT EXECUTE ON FUNCTION submit_signup_request(text, text, text, text, text) TO anon, authenticated;
