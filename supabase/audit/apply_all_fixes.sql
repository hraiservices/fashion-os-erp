-- ===== lockdown_dead_chatbot_functions.sql =====
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

-- ===== fix_empty_search_path_unqualified_names.sql =====
-- Forensic Supabase audit (2026-09-19/20): set_module_entitlements(jsonb), set_tailor_rates(jsonb),
-- set_tailor_rates_versioned(jsonb,date,text), and rename_garment_type(text,text) were hardened
-- with `SET search_path TO ''` (an earlier pass of this same audit, closing the "mutable
-- search_path" advisor warning) but their bodies reference tables unqualified
-- (`app_settings`, `tailor_rate_versions`, `orders`) rather than schema-qualified
-- (`public.app_settings`, etc).
--
-- Reproduced directly: an empty search_path means NOTHING outside pg_catalog resolves an
-- unqualified name, so every one of these 4 functions currently throws
-- `ERROR: relation "app_settings" does not exist` (or "tailor_rate_versions"/"orders") on every
-- single invocation. This is not a hardening nitpick — it is a live P0 functional bug: module
-- licensing toggles, tailor pay-rate updates, and garment-type renames (all wired to real
-- settings pages: /api/settings/role-defaults, /api/settings/tailor-rates,
-- /api/settings/garment-types/rename, use-module-entitlements.ts) are broken right now.
--
-- Fix: re-create each function with every table reference schema-qualified to `public.`, keeping
-- `SET search_path TO ''` (the search_path hardening itself was correct — only the body needed
-- to catch up to it). Logic is otherwise byte-for-byte identical to the live definitions pulled
-- via pg_get_functiondef() during this audit.
--
-- Also fixes current_tailor_rates() (called from inside set_tailor_rates_versioned): it is not
-- itself SECURITY DEFINER and carries no SET search_path override of its own, so when Postgres
-- runs it as a nested call from within a function whose search_path is '', it inherits that
-- empty search_path from the caller — reproduced directly: calling
-- set_tailor_rates_versioned(...) failed with `relation "tailor_rate_versions" does not exist`,
-- context "SQL function current_tailor_rates during inlining", even after fixing the four
-- functions above on their own. Schema-qualifying its one reference fixes it for both call paths
-- (a plain top-level call, and this nested one).

CREATE OR REPLACE FUNCTION public.set_module_entitlements(p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF lower(coalesce(auth.jwt()->>'email', '')) <> lower('connect@himanshurajput.com') THEN
    RAISE EXCEPTION 'Not authorized to change module entitlements';
  END IF;

  INSERT INTO public.app_settings (key, value) VALUES ('moduleEntitlements', p_value)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_tailor_rates(p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.app_settings (key, value) VALUES ('tailorRates', p_value)
  ON CONFLICT (key) DO UPDATE SET value = p_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_tailor_rates_versioned(p_rates jsonb, p_effective_from date, p_created_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public.tailor_rate_versions WHERE effective_from > CURRENT_DATE;

  INSERT INTO public.tailor_rate_versions (rates, effective_from, created_by)
  VALUES (p_rates, p_effective_from, p_created_by)
  ON CONFLICT (effective_from) DO UPDATE SET rates = EXCLUDED.rates, created_by = EXCLUDED.created_by;

  -- Keep the legacy app_settings.tailorRates key mirroring whatever is current today, for any
  -- code path not yet migrated off it. Harmless no-op once every reader goes through
  -- current_tailor_rates()/this table directly.
  INSERT INTO public.app_settings (key, value) VALUES ('tailorRates', public.current_tailor_rates())
  ON CONFLICT (key) DO UPDATE SET value = public.current_tailor_rates();
END;
$function$;

CREATE OR REPLACE FUNCTION public.rename_garment_type(p_old text, p_new text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rates jsonb;
  v_updated_orders integer;
BEGIN
  IF p_old IS NULL OR btrim(p_old) = '' OR p_new IS NULL OR btrim(p_new) = '' THEN
    RAISE EXCEPTION 'Garment type names cannot be empty';
  END IF;
  IF p_old = p_new THEN
    RETURN 0;
  END IF;

  SELECT value INTO v_rates FROM public.app_settings WHERE key = 'rates';
  IF v_rates IS NULL OR NOT (v_rates ? p_old) THEN
    RAISE EXCEPTION 'Garment type "%" does not exist', p_old;
  END IF;
  IF v_rates ? p_new THEN
    RAISE EXCEPTION 'A garment type named "%" already exists', p_new;
  END IF;

  -- Customer-facing rate card.
  UPDATE public.app_settings
  SET value = (value - p_old) || jsonb_build_object(p_new, value->p_old)
  WHERE key = 'rates' AND value ? p_old;

  -- Fabric usage planning, keyed the same way.
  UPDATE public.app_settings
  SET value = (value - p_old) || jsonb_build_object(p_new, value->p_old)
  WHERE key = 'fabricUsage' AND value ? p_old;

  -- Tailor payable rate card — every version, current and historical, per explicit choice to
  -- keep the garment type name consistent everywhere rather than freezing old payroll records
  -- under a now-renamed type.
  UPDATE public.tailor_rate_versions
  SET rates = (rates - p_old) || jsonb_build_object(p_new, rates->p_old)
  WHERE rates ? p_old;

  -- Every existing order's garments array — only the elements whose type matches get touched,
  -- everything else in that garment object (lining, qty, tailor, amount, ...) is preserved.
  WITH updated AS (
    UPDATE public.orders
    SET garments = (
      SELECT jsonb_agg(CASE WHEN g->>'type' = p_old THEN jsonb_set(g, '{type}', to_jsonb(p_new)) ELSE g END)
      FROM jsonb_array_elements(garments) AS g
    )
    WHERE garments IS NOT NULL AND garments @> jsonb_build_array(jsonb_build_object('type', p_old))
    RETURNING id
  )
  SELECT count(*) INTO v_updated_orders FROM updated;

  RETURN v_updated_orders;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_tailor_rates()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT rates FROM public.tailor_rate_versions
  WHERE effective_from <= CURRENT_DATE
  ORDER BY effective_from DESC
  LIMIT 1;
$function$;

-- ===== revoke_anon_table_grants.sql =====
-- Forensic Supabase audit (2026-09-19/20): a full sweep of information_schema.role_table_grants
-- found `anon` holds full privileges (INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES,
-- TRIGGER) on every single table and view in the public schema -- this is Supabase's own default
-- provisioning behavior (new tables get `GRANT ALL ... TO anon, authenticated, service_role`
-- automatically unless explicitly revoked), and the app's whole security model is built on RLS
-- being the actual gate rather than table grants -- which is the standard, documented Supabase
-- pattern, not itself a bug.
--
-- With RLS enabled and zero anon-permissive policies on any table except user_roles (fixed
-- separately in fix_user_roles_anon_phone_lookup.sql), these broad grants are currently inert.
-- But they make RLS a single point of failure rather than defense-in-depth: one future migration
-- that adds even a narrow anon policy to any table, or any code path that ever queries as anon
-- outside RLS enforcement, would immediately expose full CRUD to anyone holding just the public
-- anon key (shipped in every client bundle). Includes v_chatbot_* (five reporting views intended
-- to be read ONLY by the separate least-privilege chatbot_readonly Postgres role over a raw
-- connection string, per add_chatbot_module.sql/add_chatbot_wider_access.sql -- anon has no
-- legitimate reason to touch them at all, not even SELECT).
--
-- Fix: revoke every privilege from anon on every table/view in the public schema. Confirmed
-- safe -- the only public-facing (unauthenticated) read paths in this app are three SECURITY
-- DEFINER functions (get_customer_order_status, get_public_invoice, submit_signup_request),
-- which read with the *function owner's* privileges, not anon's own table grants, so this
-- revoke does not affect them. Superseds the narrower 3-table version of this migration from
-- earlier in this same audit pass.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;

-- ===== fix_user_roles_anon_phone_lookup.sql =====
-- Forensic Supabase audit (2026-09-19/20): user_roles had a policy
--   allow_phone_lookup_for_login FOR SELECT TO public USING (true)
-- `public` includes the unauthenticated `anon` role, and the USING clause imposes no
-- restriction at all -- combined with anon's standard (Supabase-default) table grants, this
-- meant anyone with just the public anon key (shipped in every client bundle as
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, no login required) could
--   supabase.from('user_roles').select('*')
-- and read every row: email, role, custom_permissions, linked_employee_id, phone -- the entire
-- staff/role directory, with no login at all. This is the one table in the whole schema where
-- the (otherwise harmless, RLS-blocked) broad anon table grants actually mattered, because this
-- was a real permissive policy reachable by anon, not just a table grant with no matching policy.
--
-- Checked every caller before touching this: /api/auth/phone-login and
-- /api/user-roles/phone-check both already query user_roles through the service-role client
-- (bypasses RLS entirely, unaffected either way). Every client-side read
-- (use-current-user.ts, session.ts) is scoped to the caller's own email, already covered by
-- user_roles_select_scoped ("own row OR manageUsers"). Neither /login nor /signup touches
-- user_roles directly at all (auth.* and submit_signup_request() only).
--
-- The ONE real dependency: role-bootstrap.ts's ensureUserRole() runs
-- `supabase.from('user_roles').select('email').limit(1)` with no filter, to decide whether the
-- signing-in user is the very first account (who becomes admin). Because permissive policies OR
-- together, this currently only returns the true table-wide answer *because*
-- allow_phone_lookup_for_login's `public`-role USING(true) is ORed in for every session,
-- authenticated included. Dropping the policy without fixing this call would make
-- user_roles_select_scoped's real scoping ("own row OR manageUsers") kick in instead: a
-- brand-new, not-yet-admin user has no own row and no manageUsers permission, so the query would
-- return zero rows regardless of how many real users already exist -- silently turning EVERY new
-- signup into an admin. Fixed in the same change: role-bootstrap.ts now calls the existing
-- user_roles_is_empty() SECURITY DEFINER function (already granted EXECUTE to anon/authenticated,
-- already used for exactly this purpose elsewhere), which answers correctly regardless of RLS.

DROP POLICY IF EXISTS "allow_phone_lookup_for_login" ON public.user_roles;

-- ===== fix_user_notes_owner_policies.sql =====
-- Forensic Supabase audit (2026-09-19/20): user_mini_sheets, user_scratch_notes, and user_todos
-- all have RLS enabled with ZERO policies -- Postgres denies all access by default in that state,
-- so these are fully locked (not open): nobody, including each table's own owner, can currently
-- read or write their own rows through the API. This is a functionality bug, not a security hole
-- -- whatever personal scratch-notes/todo/mini-sheet feature these back has been completely
-- broken for every user.
--
-- Each table has a `user_email text` column identifying its owner (confirmed via
-- information_schema.columns) but no auth.uid()-linked user id column, so ownership is scoped by
-- matching the caller's JWT email, same pattern as chatbot_messages_select_scoped and
-- push_subscriptions' own_subscriptions_* policies elsewhere in this schema.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['user_mini_sheets', 'user_scratch_notes', 'user_todos'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_owner_all', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (lower(user_email) = lower(coalesce(auth.jwt() ->> ''email'', '''')))
         WITH CHECK (lower(user_email) = lower(coalesce(auth.jwt() ->> ''email'', '''')))',
      tbl || '_owner_all', tbl
    );
  END LOOP;
END $$;

-- ===== add_missing_fk_indexes.sql =====
-- Forensic Supabase audit (2026-09-19/20): 17 foreign key columns had no covering index,
-- confirmed via a live sweep of information_schema + pg_index. Every FK delete/update on the
-- referenced table forces a full sequential scan of the referencing table to check for
-- dependents, and every join/filter on these columns in the app's own queries does the same.
-- Performance-only finding, not a security or correctness issue -- plain CREATE INDEX
-- IF NOT EXISTS is safe to run as-is on this database's current size. If any of these tables
-- have grown very large by the time this runs, prefer running the individual statements with
-- CREATE INDEX CONCURRENTLY outside a transaction instead (this file's statements are ordinary,
-- transactional CREATE INDEX and will briefly lock writes on their table while building).

CREATE INDEX IF NOT EXISTS idx_bill_of_materials_raw_material_id ON public.bill_of_materials (raw_material_id);
CREATE INDEX IF NOT EXISTS idx_customer_recommendations_product_id ON public.customer_recommendations (product_id);
CREATE INDEX IF NOT EXISTS idx_customers_price_list_id ON public.customers (price_list_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_payslip_id ON public.employee_advances (payslip_id);
CREATE INDEX IF NOT EXISTS idx_employees_location_id ON public.employees (location_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON public.employees (manager_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_warehouse_id ON public.inventory_ledger (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_leave_balance_adjustments_leave_type_id ON public.leave_balance_adjustments (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_balance_adjustments_employee_id ON public.leave_balance_adjustments (employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_leave_type_id ON public.leave_balances (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type_id ON public.leave_requests (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_price_list_items_product_id ON public.price_list_items (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_po_id ON public.purchase_bills (po_id);
CREATE INDEX IF NOT EXISTS idx_raw_materials_unit_id ON public.raw_materials (unit_id);
-- Note: atomic_sales_invoice_save.sql (elsewhere in this audit pass) adds a partial UNIQUE index
-- on sales_invoices(quote_id) WHERE quote_id IS NOT NULL, which already covers every row this FK
-- check needs (a null quote_id is never checked against sales_quotations). Harmless if both end
-- up applied -- just a few KB of redundant index -- but skip this one if that migration already ran.
CREATE INDEX IF NOT EXISTS idx_sales_invoices_quote_id ON public.sales_invoices (quote_id);
CREATE INDEX IF NOT EXISTS idx_sales_payments_pos_session_id ON public.sales_payments (pos_session_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor_id ON public.vendor_payments (vendor_id);

-- ===== harden_orphaned_chatbot_bucket.sql =====
-- Forensic Supabase audit (2026-09-19/20): the 'chatbot' storage bucket is public (world-
-- readable URLs), has no file_size_limit and no allowed_mime_types, and any authenticated user
-- can INSERT into it (chatbot_storage_insert policy). Confirmed via `grep -rn "\.storage\."`
-- across the entire application source: NOTHING in the current codebase reads from or writes to
-- Supabase Storage at all -- every image feature in this app (products, employees, garments)
-- stores base64 data URLs directly in Postgres columns instead. This bucket is orphaned
-- infrastructure, same pattern as the four dead chatbot RPC functions found earlier in this
-- audit, and as configured it is usable as free, anonymous, unlimited-size public file hosting
-- on this project's domain by any authenticated user.
--
-- Fix: restrict to a reasonable size limit and MIME allowlist (images/audio -- consistent with
-- what a "chatbot" bucket would plausibly have been for: photo or voice-note attachments) as
-- defense-in-depth regardless of current usage, and flip the bucket to private now that nothing
-- in the app depends on its URLs being publicly fetchable without a signed URL.

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 10485760, -- 10 MiB
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/webm']
WHERE id = 'chatbot';

-- The public SELECT policy is now moot once the bucket itself is private (Supabase enforces
-- bucket-level public/private before RLS is even consulted for unsigned URLs), but drop it
-- anyway so `pg_policies` doesn't keep advertising unauthenticated read access that no longer
-- does anything -- a future person reading policies shouldn't have to know that fact to reason
-- about this table correctly.
DROP POLICY IF EXISTS "chatbot_storage_read" ON storage.objects;
CREATE POLICY "chatbot_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chatbot');

