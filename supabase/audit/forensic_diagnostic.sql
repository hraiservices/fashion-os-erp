-- ============================================================================
-- FASHION FLOW — SUPABASE FORENSIC DIAGNOSTIC (READ-ONLY)
-- ============================================================================
-- Purpose: dump the ACTUAL live definitions this audit needs, so fixes can be
-- written from real SQL instead of guessed from Advisor summaries.
--
-- Safety: every statement here is SELECT-only. Nothing writes, alters, grants,
-- or revokes anything. Safe to run against production.
--
-- How to use:
--   1. Open Supabase Dashboard → SQL Editor → New query.
--   2. Paste this whole file and run it.
--   3. Each SELECT below returns its own result set — the Supabase SQL Editor
--      only shows the LAST one by default, so run each numbered section
--      separately (select just that block, then Run) OR use "Run" in a tool
--      that shows all result sets, OR wrap sections you want combined into
--      a UNION as shown in a couple of places already.
--   4. Copy each result set out as CSV/JSON/table and paste it back into the
--      chat (or attach as a file) labeled with its section number.
--
-- If a section returns "no rows", that itself is useful information — say so
-- rather than skipping it.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — Every RLS policy on every table, verbatim
-- ============================================================================
-- This is the single most important section. It shows exact USING/WITH CHECK
-- expressions, whether a policy is PERMISSIVE or RESTRICTIVE, which role(s)
-- it applies to, and which command it covers.

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,      -- 'PERMISSIVE' or 'RESTRICTIVE'
  roles,
  cmd,              -- SELECT / INSERT / UPDATE / DELETE / ALL
  qual        AS using_expression,
  with_check  AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;


-- ============================================================================
-- SECTION 2 — Every table's RLS enabled/forced state, and whether it has ANY
-- policy at all (catches "RLS enabled but zero policies" = fully locked, and
-- "RLS disabled" = fully open to anyone with the anon/authenticated key)
-- ============================================================================

SELECT
  c.relname AS table_name,
  c.relrowsecurity  AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  COUNT(p.policyname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'   -- ordinary tables only
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY
  (c.relrowsecurity = false) DESC,          -- RLS-disabled tables first (worst)
  (COUNT(p.policyname) = 0) DESC,           -- then RLS-on-but-no-policy tables
  c.relname;


-- ============================================================================
-- SECTION 3 — Every SECURITY DEFINER function: owner, volatility, search_path
-- setting, and who can EXECUTE it (anon / authenticated / public / service_role)
-- ============================================================================

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  r.rolname AS owner,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config_settings,      -- look for search_path here
  (
    SELECT string_agg(DISTINCT grantee.rolname, ', ')
    FROM information_schema.routine_privileges rp
    JOIN pg_roles grantee ON grantee.rolname = rp.grantee
    WHERE rp.routine_schema = 'public'
      AND rp.routine_name = p.proname
      AND rp.privilege_type = 'EXECUTE'
  ) AS execute_granted_to
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
ORDER BY p.prosecdef DESC, p.proname;


-- ============================================================================
-- SECTION 4 — Full source of every function named in the audit report
-- (chatbot functions, public token functions, auth helpers, and anything else
-- SECURITY DEFINER). This is what lets real fixes get written.
-- ============================================================================

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.prosecdef = true   -- every SECURITY DEFINER function, no exceptions
    OR p.proname IN (
      'chatbot_data', 'get_customers_for_chatbot', 'get_orders_for_chatbot',
      'get_settings_for_chatbot', 'enable_chatbot_access',
      'get_customer_order_status', 'get_public_invoice', 'submit_signup_request',
      'current_employee_id', 'current_role_name', 'has_perm',
      'is_back_office', 'user_roles_is_empty',
      'set_module_entitlements', 'set_tailor_rates', 'set_tailor_rates_versioned',
      'rename_garment_type'
    )
  )
ORDER BY p.proname;


-- ============================================================================
-- SECTION 5 — app_settings: every row's key (not value, to avoid pasting live
-- secrets into chat) plus which policies currently gate each operation
-- ============================================================================

-- 5a. Just the keys that exist right now, so we know exactly what's in there.
--     Deliberately NOT selecting `value` — key names are all we need to spot
--     anything secret-shaped; do not paste `value` back for any key that
--     looks like it holds a credential.
SELECT key, jsonb_typeof(value) AS value_json_type, pg_column_size(value) AS value_size_bytes
FROM app_settings
ORDER BY key;

-- 5b. All policies on app_settings specifically (subset of Section 1, kept
--     separate since this table is the #1 flagged risk)
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'app_settings'
ORDER BY cmd, policyname;


-- ============================================================================
-- SECTION 6 — Tenant/company isolation model: does a tenant/company concept
-- exist anywhere in the schema at all?
-- ============================================================================

-- 6a. Any column across all public tables named like a tenant/company id
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    column_name ILIKE '%tenant%'
    OR column_name ILIKE '%company%'
    OR column_name ILIKE '%org_id%'
    OR column_name ILIKE '%organization%'
    OR column_name ILIKE '%shop_id%'
  )
ORDER BY table_name, column_name;

-- 6b. If nothing comes back from 6a: this database has ONE tenant per
-- Supabase project (single-shop model), which changes what "tenant isolation"
-- even means here. Confirm by checking whether shop_locations is a single-row
-- config table or genuinely multi-shop-per-account:
SELECT count(*) AS shop_locations_row_count FROM shop_locations;


-- ============================================================================
-- SECTION 7 — user_roles: full policy detail (flagged for overlapping SELECT
-- policies) plus its actual columns, to check what a "phone lookup for login"
-- policy could leak
-- ============================================================================

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_roles'
ORDER BY cmd, policyname;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_roles'
ORDER BY ordinal_position;


-- ============================================================================
-- SECTION 8 — Every foreign key and whether it has a covering index (the
-- "17 unindexed foreign keys" finding)
-- ============================================================================

SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column,
  EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
    WHERE t.relname = tc.table_name
      AND a.attname = kcu.column_name
      AND i.indkey[0] = a.attnum   -- column is the FIRST key column of some index
  ) AS has_leading_index
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY has_leading_index ASC, tc.table_name;


-- ============================================================================
-- SECTION 9 — Index usage stats (the "19 unused indexes" finding) — includes
-- table size and index size so removal risk can be judged, plus how long
-- stats have been accumulating
-- ============================================================================

SELECT
  s.schemaname,
  s.relname  AS table_name,
  s.indexrelname AS index_name,
  s.idx_scan AS times_used,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  pg_size_pretty(pg_relation_size(s.relid)) AS table_size,
  ix.indisunique AS is_unique,
  ix.indisprimary AS is_primary_key
FROM pg_stat_user_indexes s
JOIN pg_index ix ON ix.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
ORDER BY s.idx_scan ASC, index_size DESC;

-- 9b. When did stats last reset? (an "unused" index right after a reset is
-- not evidence of anything — this tells us if the 19-index finding is even
-- based on meaningful history)
SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();


-- ============================================================================
-- SECTION 10 — Data integrity spot-checks
-- ============================================================================

-- 10a. Duplicate mobile numbers on customers (if uniqueness is expected)
SELECT mobile, count(*) AS n
FROM customers
WHERE mobile IS NOT NULL AND mobile <> ''
GROUP BY mobile
HAVING count(*) > 1
ORDER BY n DESC;

-- 10b. Negative stock in the derived inventory view
SELECT item_type, item_id, stock_qty
FROM inventory_stock
WHERE stock_qty < 0
ORDER BY stock_qty ASC
LIMIT 100;

-- 10c. Orders with balance that doesn't reconcile against payments (adjust
-- column names here if they differ from what's assumed)
SELECT id, total, advance, balance, (total - advance) AS expected_balance
FROM orders
WHERE balance IS NOT NULL
  AND total IS NOT NULL
  AND advance IS NOT NULL
  AND balance <> (total - advance)
LIMIT 100;

-- 10d. Negative monetary values anywhere obvious
SELECT 'orders.total' AS field, id::text AS row_id FROM orders WHERE total < 0
UNION ALL
SELECT 'orders.advance', id::text FROM orders WHERE advance < 0
UNION ALL
SELECT 'orders.balance', id::text FROM orders WHERE balance < 0
UNION ALL
SELECT 'sales_invoices.total', id::text FROM sales_invoices WHERE total < 0
LIMIT 200;

-- 10e. Duplicate invoice numbers (should be impossible if uniquely
-- constrained — this proves whether that constraint actually exists)
SELECT invoice_number, count(*) AS n
FROM sales_invoices
GROUP BY invoice_number
HAVING count(*) > 1;


-- ============================================================================
-- SECTION 11 — Auth config that can't be seen from SQL (informational; these
-- must be checked in Dashboard → Authentication → Policies / Providers)
-- ============================================================================
-- Cannot be queried via SQL — please check manually and report back:
--   [ ] Authentication → Policies → "Leaked password protection" — on/off?
--   [ ] Authentication → Providers → email confirmations required? — on/off?
--   [ ] Authentication → Sessions → session/JWT expiry duration?
--   [ ] Storage → Buckets → for each bucket: public or private?
--   [ ] Database → Replication → which tables are in a realtime publication?


-- ============================================================================
-- SECTION 12 — Realtime publications (this part CAN be queried)
-- ============================================================================

SELECT
  p.pubname,
  c.relname AS table_name
FROM pg_publication p
JOIN pg_publication_rel pr ON pr.prpubid = p.oid
JOIN pg_class c ON c.oid = pr.prrelid
ORDER BY p.pubname, c.relname;


-- ============================================================================
-- SECTION 13 — Storage bucket policies (storage.objects RLS) — the app-level
-- read/write rules per bucket
-- ============================================================================

SELECT id AS bucket_id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd, policyname;


-- ============================================================================
-- SECTION 14 — Migration/version-control discipline: does this project even
-- have a migration history table, and if so what's actually in it vs. what's
-- in the git repo (119 files as of this audit)?
-- ============================================================================

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
-- If this errors with "relation does not exist", that itself is the finding:
-- this database was never managed through `supabase migration`/CLI at all,
-- meaning EVERY schema change was applied by hand through the SQL Editor —
-- please report back whether this query errored or returned rows.


-- ============================================================================
-- END OF DIAGNOSTIC SCRIPT
-- ============================================================================
