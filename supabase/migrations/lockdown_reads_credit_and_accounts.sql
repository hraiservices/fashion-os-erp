-- Phase 3 of the read lockdown — the money-bearing tables that phases 1 and 2 missed.
--
-- A forensic audit found customer_credit_balances, customer_credit_ledger and payment_accounts
-- still carrying the original blanket `FOR SELECT TO authenticated USING (true)` policy from
-- add_customer_credit_ledger.sql / add_payment_deposit_account.sql. Every other financial table
-- was narrowed to a permission predicate in lockdown_reads_whole_table.sql; these three were not,
-- so any staff login — a tailor, a sales assistant with no customer permission at all — could
-- read every customer's credit balance and the full credit movement history:
--   supabase.from('customer_credit_balances').select('*')  -- what the shop owes every customer
--   supabase.from('customer_credit_ledger').select('*')    -- every issue/redeem, with notes
--   supabase.from('payment_accounts').select('*')          -- the shop's bank/cash accounts
--
-- Writes were never exposed (RLS on with no write policy denies by default), and
-- day_book_closings / day_book_cash_adjustments carry no policies at all, so they are already
-- service-role only. This is read-side only, and brings these three in line with the predicate
-- the rest of the schema already uses.
--
-- Customer credit is customer money, so it follows customers' own gate (manageCustomers), plus
-- the POS/sales roles that actually redeem it at the counter. Payment accounts are a back-office
-- banking concern and follow is_back_office(), matching expenses.

DO $$
DECLARE
  rule  RECORD;
  pol   RECORD;
  rules CONSTANT jsonb := '[
    {"t": "customer_credit_balances", "u": "has_perm(''manageCustomers'') OR has_perm(''manageSales'') OR has_perm(''usePOS'')"},
    {"t": "customer_credit_ledger",   "u": "has_perm(''manageCustomers'') OR has_perm(''manageSales'') OR has_perm(''usePOS'')"},
    {"t": "payment_accounts",         "u": "is_back_office() OR has_perm(''manageSales'') OR has_perm(''usePOS'')"}
  ]'::jsonb;
BEGIN
  FOR rule IN SELECT (r ->> 't') AS tbl, (r ->> 'u') AS using_expr FROM jsonb_array_elements(rules) AS r
  LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = rule.tbl
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rule.tbl);

    -- Same targeted drop as phase 2: only policies that grant `authenticated` a read. Anything
    -- anon-facing belongs to a different role and must survive.
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
