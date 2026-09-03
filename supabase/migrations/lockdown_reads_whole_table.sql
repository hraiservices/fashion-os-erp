-- Phase 2 of the read lockdown. Requires add_rls_identity_helpers.sql.
--
-- lockdown_hr_payroll_writes.sql and lockdown_operational_writes.sql took INSERT/UPDATE/DELETE
-- away from `authenticated` but left SELECT at `USING (true)` on all 44 tables, deliberately:
-- narrowing reads needs per-row ownership rules the schema did not model. This migration does
-- the half that needs no ownership model at all — the tables where the answer is simply "does
-- this session hold the permission the screen already requires".
--
-- These map onto RESTRICTED_ROUTE_PREFIXES and the permission flags the pages themselves check,
-- so a tailor loses database access to precisely what the UI already hides from them. What this
-- closes, for a tailor whose every relevant permission is false:
--   supabase.from('payslips').select('*')        -- every colleague's net pay
--   supabase.from('purchase_bills').select('*')  -- supplier pricing
--   supabase.from('product_cost_sheets')...      -- margin on every product
--   supabase.from('customers').select('*')       -- the entire customer list with phone numbers
--
-- A narrowed SELECT does not raise — it returns fewer rows. That is the risk in this whole
-- exercise, so the tables whose rows are summed into a total the whole shop relies on (orders,
-- order_payments) are NOT here; they are per-row rules in lockdown_reads_per_row.sql, and the
-- reports that aggregate them are gated on viewReports rather than filtered.
--
-- Every predicate below is a whole-table yes/no, so nothing is ever partially summed: a user
-- either sees the table or sees none of it.

DO $$
DECLARE
  rule  RECORD;
  pol   RECORD;
  rules CONSTANT jsonb := '[
    {"t": "payroll_runs",              "u": "has_perm(''managePayroll'')"},

    {"t": "expenses",                  "u": "is_back_office()"},
    {"t": "order_expenses",            "u": "is_back_office()"},
    {"t": "billing_events",            "u": "is_back_office()"},

    {"t": "purchase_bills",            "u": "has_perm(''managePurchases'')"},
    {"t": "purchase_orders",           "u": "has_perm(''managePurchases'')"},
    {"t": "vendors",                   "u": "has_perm(''managePurchases'')"},
    {"t": "vendor_payments",           "u": "has_perm(''managePurchases'')"},
    {"t": "vendor_credits",            "u": "has_perm(''managePurchases'')"},

    {"t": "product_cost_sheets",       "u": "is_back_office()"},
    {"t": "cost_sheet_items",          "u": "is_back_office()"},
    {"t": "bill_of_materials",         "u": "is_back_office() OR has_perm(''manageInventory'')"},

    {"t": "price_lists",               "u": "has_perm(''manageSales'') OR has_perm(''manageInventory'')"},
    {"t": "price_list_items",          "u": "has_perm(''manageSales'') OR has_perm(''manageInventory'')"},

    {"t": "sales_invoices",            "u": "has_perm(''manageSales'') OR has_perm(''usePOS'')"},
    {"t": "sales_payments",            "u": "has_perm(''manageSales'') OR has_perm(''usePOS'')"},
    {"t": "sales_credit_notes",        "u": "has_perm(''manageSales'') OR has_perm(''usePOS'')"},
    {"t": "sales_quotations",          "u": "has_perm(''manageSales'')"},
    {"t": "recurring_invoice_profiles","u": "has_perm(''manageSales'')"},

    {"t": "customers",                 "u": "has_perm(''manageCustomers'')"},
    {"t": "referral_coupons",          "u": "has_perm(''manageCustomers'')"},
    {"t": "customer_recommendations",  "u": "has_perm(''manageCustomers'')"},

    {"t": "products",                  "u": "has_perm(''manageInventory'') OR has_perm(''manageSales'') OR has_perm(''usePOS'') OR has_perm(''managePurchases'')"},
    {"t": "raw_materials",             "u": "has_perm(''manageInventory'') OR has_perm(''manageSales'') OR has_perm(''usePOS'') OR has_perm(''managePurchases'')"},
    {"t": "inventory_ledger",          "u": "has_perm(''manageInventory'') OR has_perm(''manageSales'') OR has_perm(''usePOS'') OR has_perm(''managePurchases'')"},
    {"t": "warehouses",                "u": "has_perm(''manageInventory'') OR has_perm(''manageSales'') OR has_perm(''usePOS'') OR has_perm(''managePurchases'')"},
    {"t": "units_of_measure",          "u": "has_perm(''manageInventory'') OR has_perm(''manageSales'') OR has_perm(''usePOS'') OR has_perm(''managePurchases'')"}
  ]'::jsonb;
BEGIN
  FOR rule IN SELECT (r ->> 't') AS tbl, (r ->> 'u') AS using_expr FROM jsonb_array_elements(rules) AS r
  LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = rule.tbl
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rule.tbl);

    -- Drop only the policies that grant `authenticated` a read. An anon-facing policy (the
    -- public invoice link) belongs to a different role and must survive untouched.
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = rule.tbl
        AND cmd IN ('SELECT', 'ALL')
        AND 'authenticated' = ANY (roles)
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, rule.tbl);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      rule.tbl || '_select_permitted', rule.tbl, rule.using_expr
    );
  END LOOP;
END $$;

-- ── activity_log, which needs its INSERT kept ───────────────────────────────
-- Handled apart from the loop above because it is the one table here the browser legitimately
-- WRITES: logAction() appends to it from server routes holding the caller's own session, so the
-- loop's "drop every policy covering SELECT or ALL" would take the insert away with it. Reading
-- it is a different matter — it is the audit trail, and its `details` narrate every salary
-- change, permission grant and payment in the shop. /activity-log is already a restricted route;
-- this makes the table agree.
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_log'
      AND cmd IN ('SELECT', 'ALL') AND 'authenticated' = ANY (roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_log', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "activity_log_select_back_office" ON activity_log
  FOR SELECT TO authenticated USING (is_back_office() OR has_perm('viewReports'));

-- Append-only for everyone else: any authenticated session may add to the audit trail (that is
-- what logAction does on their behalf), nobody may amend or erase it.
DROP POLICY IF EXISTS "activity_log_insert_authenticated" ON activity_log;
CREATE POLICY "activity_log_insert_authenticated" ON activity_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── Views, which RLS does not cover ─────────────────────────────────────────
-- A view runs with its OWNER's privileges unless declared security_invoker, so every policy
-- above is bypassable through a view over the same table. Both cases here are handled, and they
-- need opposite treatment.

-- inventory_stock is the app's own stock-on-hand view over inventory_ledger. Making it
-- security_invoker pushes the caller's identity down to the ledger, so it inherits the policy
-- created above rather than sidestepping it. (Postgres 15+; Supabase is well past that.)
ALTER VIEW public.inventory_stock SET (security_invoker = true);

-- The v_chatbot_* views are NOT read by the browser at all: the AI Copilot reads them over a
-- separate least-privilege Postgres connection as `chatbot_readonly` (add_chatbot_module.sql),
-- and the daily briefing reads them with the service-role client. Supabase's default grants
-- nevertheless expose them to `authenticated` — and v_chatbot_orders is every order,
-- v_chatbot_payments every payment. Left alone they would be the single widest hole in this
-- whole exercise. security_invoker is the wrong tool here (it would apply RLS as
-- chatbot_readonly, which holds no policies, and break the Copilot outright); the right one is
-- to take the grant away from the roles that never legitimately had it.
REVOKE SELECT ON public.v_chatbot_orders, public.v_chatbot_invoices, public.v_chatbot_expenses,
                 public.v_chatbot_payments, public.v_chatbot_inventory
  FROM authenticated, anon;
