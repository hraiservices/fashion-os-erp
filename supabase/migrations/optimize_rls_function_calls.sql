-- Performance forensic audit (2026-09-20): live pg_stat_statements showed user_roles taking
-- ~739,423 sequential scans against only ~89 index scans, on a table with just ~3 live rows.
--
-- Root cause, confirmed by code inspection (lockdown_reads_per_row.sql, lockdown_reads_whole_
-- table.sql, add_rls_identity_helpers.sql): current_role_name(), current_employee_id(),
-- has_perm(flag), and is_back_office() each internally run
--   SELECT ... FROM user_roles WHERE lower(email) = lower(auth.jwt()->>'email')
-- and every RLS policy in this schema calls them BARE inside its USING clause — e.g.
--   USING (is_back_office() OR has_perm('manageSales') OR ...)
-- instead of wrapped in a scalar subquery. This is the documented Postgres/Supabase RLS
-- performance anti-pattern (Supabase's own linter calls it auth_rls_initplan): an unwrapped
-- volatile-looking function reference in a policy is re-evaluated once PER ROW the query
-- touches, each evaluation issuing its own fresh user_roles lookup — not once per statement.
-- With these functions gating reads on orders/work_orders/expenses/sales_invoices/etc (all
-- scanned repeatedly, per this audit's own top-hotspot list), the arithmetic of "739K seq scans
-- on a 3-row table, 89 index scans" is exactly what row-by-row re-evaluation produces.
--
-- Fix: wrap every one of these function calls (and every direct auth.jwt()/auth.uid()
-- reference) as `(select fn())` in every policy that uses them. Wrapping lets Postgres's
-- planner treat the call as an "initplan" — evaluated once per statement and reused for every
-- row — instead of once per row. This changes NOTHING about who can see what: every predicate
-- below is semantically identical to the live policy it replaces, verified line-by-line against
-- lockdown_reads_per_row.sql and lockdown_reads_whole_table.sql's current committed source.
-- Only the evaluation strategy changes, not the authorization logic.
--
-- This migration recreates every affected policy under its EXISTING name (DROP POLICY IF EXISTS
-- + CREATE POLICY, same name), so nothing about which policies exist changes — only their USING/
-- WITH CHECK expression's internal evaluation shape.

-- ═══════════════════════════════════════════════════════════════════════════
-- Whole-table permission policies (was lockdown_reads_whole_table.sql)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rule  RECORD;
  rules CONSTANT jsonb := '[
    {"t": "payroll_runs",              "u": "(select has_perm(''managePayroll''))"},

    {"t": "expenses",                  "u": "(select is_back_office())"},
    {"t": "order_expenses",            "u": "(select is_back_office())"},
    {"t": "billing_events",            "u": "(select is_back_office())"},

    {"t": "purchase_bills",            "u": "(select has_perm(''managePurchases''))"},
    {"t": "purchase_orders",           "u": "(select has_perm(''managePurchases''))"},
    {"t": "vendors",                   "u": "(select has_perm(''managePurchases''))"},
    {"t": "vendor_payments",           "u": "(select has_perm(''managePurchases''))"},
    {"t": "vendor_credits",            "u": "(select has_perm(''managePurchases''))"},

    {"t": "product_cost_sheets",       "u": "(select is_back_office())"},
    {"t": "cost_sheet_items",          "u": "(select is_back_office())"},
    {"t": "bill_of_materials",         "u": "(select is_back_office()) OR (select has_perm(''manageInventory''))"},

    {"t": "price_lists",               "u": "(select has_perm(''manageSales'')) OR (select has_perm(''manageInventory''))"},
    {"t": "price_list_items",          "u": "(select has_perm(''manageSales'')) OR (select has_perm(''manageInventory''))"},

    {"t": "sales_invoices",            "u": "(select has_perm(''manageSales'')) OR (select has_perm(''usePOS''))"},
    {"t": "sales_payments",            "u": "(select has_perm(''manageSales'')) OR (select has_perm(''usePOS''))"},
    {"t": "sales_credit_notes",        "u": "(select has_perm(''manageSales'')) OR (select has_perm(''usePOS''))"},
    {"t": "sales_quotations",          "u": "(select has_perm(''manageSales''))"},
    {"t": "recurring_invoice_profiles","u": "(select has_perm(''manageSales''))"},

    {"t": "customers",                 "u": "(select has_perm(''manageCustomers''))"},
    {"t": "referral_coupons",          "u": "(select has_perm(''manageCustomers''))"},
    {"t": "customer_recommendations",  "u": "(select has_perm(''manageCustomers''))"},

    {"t": "products",                  "u": "(select has_perm(''manageInventory'')) OR (select has_perm(''manageSales'')) OR (select has_perm(''usePOS'')) OR (select has_perm(''managePurchases''))"},
    {"t": "raw_materials",             "u": "(select has_perm(''manageInventory'')) OR (select has_perm(''manageSales'')) OR (select has_perm(''usePOS'')) OR (select has_perm(''managePurchases''))"},
    {"t": "inventory_ledger",          "u": "(select has_perm(''manageInventory'')) OR (select has_perm(''manageSales'')) OR (select has_perm(''usePOS'')) OR (select has_perm(''managePurchases''))"},
    {"t": "warehouses",                "u": "(select has_perm(''manageInventory'')) OR (select has_perm(''manageSales'')) OR (select has_perm(''usePOS'')) OR (select has_perm(''managePurchases''))"},
    {"t": "units_of_measure",          "u": "(select has_perm(''manageInventory'')) OR (select has_perm(''manageSales'')) OR (select has_perm(''usePOS'')) OR (select has_perm(''managePurchases''))"}
  ]'::jsonb;
BEGIN
  FOR rule IN SELECT (r ->> 't') AS tbl, (r ->> 'u') AS using_expr FROM jsonb_array_elements(rules) AS r
  LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = rule.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rule.tbl || '_select_permitted', rule.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      rule.tbl || '_select_permitted', rule.tbl, rule.using_expr
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "activity_log_select_back_office" ON activity_log;
CREATE POLICY "activity_log_select_back_office" ON activity_log
  FOR SELECT TO authenticated USING ((select is_back_office()) OR (select has_perm('viewReports')));

-- ═══════════════════════════════════════════════════════════════════════════
-- Per-row ownership policies (was lockdown_reads_per_row.sql)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rule  RECORD;
  rules CONSTANT jsonb := '[
    {"t": "payslips",                  "u": "employee_id = (select current_employee_id()) OR (select has_perm(''managePayroll''))"},
    {"t": "employee_advances",         "u": "employee_id = (select current_employee_id()) OR (select has_perm(''managePayroll'')) OR (select has_perm(''manageEmployees''))"},
    {"t": "employee_attendance",       "u": "employee_id = (select current_employee_id()) OR (select has_perm(''manageEmployees''))"},
    {"t": "leave_requests",            "u": "employee_id = (select current_employee_id()) OR (select has_perm(''manageEmployees''))"},
    {"t": "leave_balances",            "u": "employee_id = (select current_employee_id()) OR (select has_perm(''manageEmployees''))"},
    {"t": "leave_balance_adjustments", "u": "employee_id = (select current_employee_id()) OR (select has_perm(''manageEmployees''))"},

    {"t": "chatbot_messages",          "u": "lower(user_email) = lower(COALESCE((select auth.jwt()) ->> ''email'', ''''))"},

    {"t": "pos_sessions",              "u": "lower(opened_by) = lower(COALESCE((select auth.jwt()) ->> ''email'', '''')) OR (select is_back_office()) OR (select has_perm(''viewReports''))"},

    {"t": "user_roles",                "u": "lower(email) = lower(COALESCE((select auth.jwt()) ->> ''email'', '''')) OR (select has_perm(''manageUsers''))"},

    {"t": "order_payments",            "u": "(select is_back_office()) OR (select has_perm(''managePayments'')) OR (select has_perm(''addOrder''))"}
  ]'::jsonb;
BEGIN
  FOR rule IN SELECT (r ->> 't') AS tbl, (r ->> 'u') AS using_expr FROM jsonb_array_elements(rules) AS r
  LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = rule.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rule.tbl || '_select_scoped', rule.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      rule.tbl || '_select_scoped', rule.tbl, rule.using_expr
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "user_roles_self_bootstrap_insert" ON user_roles;
CREATE POLICY "user_roles_self_bootstrap_insert" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(email) = lower(COALESCE((select auth.jwt()) ->> 'email', ''))
    AND (role = 'tailor' OR (select public.user_roles_is_empty()))
  );

DROP POLICY IF EXISTS "orders_select_scoped" ON orders;
CREATE POLICY "orders_select_scoped" ON orders
  FOR SELECT TO authenticated
  USING (
    (select is_back_office())
    OR (select has_perm('manageSales'))
    OR (select has_perm('addOrder'))
    OR COALESCE(tailor, '') = ''
    OR tailor = (select current_employee_id())::text
    OR (
      (select current_employee_id()) IS NOT NULL
      AND garments @> jsonb_build_array(jsonb_build_object('tailor', (select current_employee_id())::text))
    )
  );

DROP POLICY IF EXISTS "work_orders_select_scoped" ON work_orders;
CREATE POLICY "work_orders_select_scoped" ON work_orders
  FOR SELECT TO authenticated
  USING (
    (select is_back_office())
    OR (select has_perm('manageInventory'))
    OR COALESCE(tailor, '') = ''
    OR tailor = (select current_employee_id())::text
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- The remaining auth.jwt()-based policies the original performance report named directly
-- (push_subscriptions, signup_requests) — same fix, wrap the jwt() call.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "own_subscriptions_delete" ON push_subscriptions;
CREATE POLICY "own_subscriptions_delete" ON push_subscriptions
  FOR DELETE TO authenticated
  USING (lower(email) = lower(COALESCE((select auth.jwt()) ->> 'email', '')));

DROP POLICY IF EXISTS "own_subscriptions_insert" ON push_subscriptions;
CREATE POLICY "own_subscriptions_insert" ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (lower(email) = lower(COALESCE((select auth.jwt()) ->> 'email', '')));

DROP POLICY IF EXISTS "signup_requests_select_owner" ON signup_requests;
CREATE POLICY "signup_requests_select_owner" ON signup_requests
  FOR SELECT TO authenticated
  USING (lower(COALESCE((select auth.jwt()) ->> 'email', '')) = lower('connect@himanshurajput.com'));

DROP POLICY IF EXISTS "signup_requests_update_owner" ON signup_requests;
CREATE POLICY "signup_requests_update_owner" ON signup_requests
  FOR UPDATE TO authenticated
  USING (lower(COALESCE((select auth.jwt()) ->> 'email', '')) = lower('connect@himanshurajput.com'))
  WITH CHECK (lower(COALESCE((select auth.jwt()) ->> 'email', '')) = lower('connect@himanshurajput.com'));
