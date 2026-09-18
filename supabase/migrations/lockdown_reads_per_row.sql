-- Phase 3 of the read lockdown. Requires add_rls_identity_helpers.sql, and should be run after
-- lockdown_reads_whole_table.sql.
--
-- The tables where the answer is not "does this session hold a permission" but "is this row
-- yours". Highest-value data in the schema, smallest query volume, and — because the ownership
-- column already exists on every one of them — the cleanest predicates in this exercise.
--
-- What this closes for any logged-in user:
--   supabase.from('payslips').select('*')             -- every colleague's net pay
--   supabase.from('employee_advances').select('*')    -- who is borrowing against their wages
--   supabase.from('employee_attendance').select('*')  -- everyone's movements, with GPS + photos
--   supabase.from('user_roles').select('*')           -- the full staff/permission map
--   supabase.from('chatbot_messages').select('*')     -- everyone else's Copilot conversations
--   supabase.from('orders').select('*')               -- the whole order book, for a tailor
--
-- Deliberately NOT here: `employees` keeps a readable row for every staff member. The tailor
-- dropdown, the "who is assigned" label on an order and the attendance screen all resolve names
-- from it, so scoping it per row would break the app for the roles it is meant to protect. Its
-- sensitive columns are handled the only way Postgres can express "these columns, not those" —
-- column-level grants, in lockdown_employee_salary_columns.sql.

-- ── HR: your own row, or the permission that owns the module ────────────────
DO $$
DECLARE
  rule  RECORD;
  pol   RECORD;
  rules CONSTANT jsonb := '[
    {"t": "payslips",                  "u": "employee_id = current_employee_id() OR has_perm(''managePayroll'')"},
    {"t": "employee_advances",         "u": "employee_id = current_employee_id() OR has_perm(''managePayroll'') OR has_perm(''manageEmployees'')"},
    {"t": "employee_attendance",       "u": "employee_id = current_employee_id() OR has_perm(''manageEmployees'')"},
    {"t": "leave_requests",            "u": "employee_id = current_employee_id() OR has_perm(''manageEmployees'')"},
    {"t": "leave_balances",            "u": "employee_id = current_employee_id() OR has_perm(''manageEmployees'')"},
    {"t": "leave_balance_adjustments", "u": "employee_id = current_employee_id() OR has_perm(''manageEmployees'')"},

    {"t": "chatbot_messages",          "u": "lower(user_email) = lower(COALESCE(auth.jwt() ->> ''email'', ''''))"},

    {"t": "pos_sessions",              "u": "lower(opened_by) = lower(COALESCE(auth.jwt() ->> ''email'', '''')) OR is_back_office() OR has_perm(''viewReports'')"},

    {"t": "user_roles",                "u": "lower(email) = lower(COALESCE(auth.jwt() ->> ''email'', '''')) OR has_perm(''manageUsers'')"},

    {"t": "order_payments",            "u": "is_back_office() OR has_perm(''managePayments'') OR has_perm(''addOrder'')"}
  ]'::jsonb;
BEGIN
  FOR rule IN SELECT (r ->> 't') AS tbl, (r ->> 'u') AS using_expr FROM jsonb_array_elements(rules) AS r
  LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = rule.tbl
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rule.tbl);

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
      rule.tbl || '_select_scoped', rule.tbl, rule.using_expr
    );
  END LOOP;
END $$;

-- ── The user_roles self-bootstrap policy has to be rewritten, not just kept ──
-- lockdown_user_roles_writes.sql lets a brand-new login insert its own row, and grants admin
-- only when the table is completely empty:
--     role = 'tailor' OR NOT EXISTS (SELECT 1 FROM user_roles)
-- A policy expression runs as the calling user with RLS applied to the tables it names. Until a
-- moment ago SELECT on user_roles was USING (true), so that NOT EXISTS saw the real table. With
-- the self-scoped SELECT policy created above, a second employee signing up sees NO rows — their
-- own does not exist yet — so `NOT EXISTS` becomes trivially true and they may insert
-- themselves as admin. Narrowing reads would, left here, have opened a one-signup path to admin.
--
-- The emptiness check therefore has to be answered outside the caller's own visibility.
CREATE OR REPLACE FUNCTION public.user_roles_is_empty() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT NOT EXISTS (SELECT 1 FROM user_roles);
$fn$;
REVOKE ALL ON FUNCTION public.user_roles_is_empty() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_roles_is_empty() TO authenticated, service_role;

DROP POLICY IF EXISTS "user_roles_self_bootstrap_insert" ON user_roles;
CREATE POLICY "user_roles_self_bootstrap_insert" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    AND (role = 'tailor' OR public.user_roles_is_empty())
  );

-- ── Orders and work orders ──────────────────────────────────────────────────
-- Confirmed with the owner: a tailor sees the orders assigned to them, PLUS every unassigned
-- one. The "plus unassigned" half is not a concession — without it a new order would be
-- invisible to the entire shop floor until someone in the back office assigned it, and the board
-- would look empty to the people who work from it.
--
-- Both the order-level `tailor` and the per-garment tailor inside `garments` are checked.
-- fix_garment_tailor_mismatch.sql made those agree and the app keeps them in step, but a policy
-- that trusts only one of them fails closed on any row where they ever drift — and "fails closed"
-- here means a tailor loses their own work off the board. The containment test uses the existing
-- idx_orders_garments_gin index.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND cmd IN ('SELECT', 'ALL') AND 'authenticated' = ANY (roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "orders_select_scoped" ON orders
  FOR SELECT TO authenticated
  USING (
    is_back_office()
    OR has_perm('manageSales')
    OR has_perm('addOrder')
    OR COALESCE(tailor, '') = ''
    OR tailor = current_employee_id()::text
    OR (
      current_employee_id() IS NOT NULL
      AND garments @> jsonb_build_array(jsonb_build_object('tailor', current_employee_id()::text))
    )
  );

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_orders'
      AND cmd IN ('SELECT', 'ALL') AND 'authenticated' = ANY (roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.work_orders', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "work_orders_select_scoped" ON work_orders
  FOR SELECT TO authenticated
  USING (
    is_back_office()
    OR has_perm('manageInventory')
    OR COALESCE(tailor, '') = ''
    OR tailor = current_employee_id()::text
  );
