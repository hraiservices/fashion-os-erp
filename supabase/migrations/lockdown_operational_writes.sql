-- Finishes what lockdown_hr_payroll_writes.sql started: the same default-permissive RLS
-- (`FOR ALL TO authenticated USING (true) WITH CHECK (true)`) covered every remaining
-- operational table, so the whole ledger was editable from the browser console with the session
-- the app already holds. The HR/comp cluster was locked first; this is the rest of the money.
--
-- What was reachable by any logged-in user, regardless of role:
--   supabase.from('orders').update({ balance: 0, advance: 5000 })      -- mark an order paid
--   supabase.from('order_payments').insert({ ... })                    -- invent a receipt
--   supabase.from('sales_invoices').update({ payment_status: 'paid' })
--   supabase.from('expenses').insert({ ... })                          -- fabricate expenses
--   supabase.from('products').update({ stock_qty: 0 })                 -- cover a stock theft
--   supabase.from('pos_sessions').update({ expected_cash: <short> })   -- hide a till variance
--
-- None of the server-side protection applied to any of it: not the managePayments /
-- manageSales / manageInventory checks, not the optimistic-concurrency guard in
-- /api/orders/[id]/payment (expectedAdvance), not the discount-marker sanitisation that stops a
-- note forging a "🎁 ₹500" line, not the stock guards. Those all sit in API routes the console
-- simply doesn't call.
--
-- It also closes a second door that is easy to miss: most of the money RPCs
-- (record_order_payment, record_sales_payment, edit_order, replace_inventory_ledger,
-- delete_order_payment, ...) are SECURITY INVOKER, so they execute with the caller's own
-- privileges and RLS applies to them. Under the old policies a browser could call them directly
-- — `supabase.rpc('record_order_payment', {...})` — and skip the route's permission check
-- entirely. With writes revoked, those calls now fail at the table, so the RPCs are only usable
-- from the API routes, which pass the service-role client after authorising the caller. (The
-- SECURITY DEFINER ones — confirm_order_payables, record_vendor_payment, approve_leave_request,
-- confirm_wo_payable — bypass RLS by design and are unaffected either way.)
--
-- SELECT stays exactly as permissive as it is today: every list, report and dashboard in the app
-- reads these tables straight from the browser, and narrowing reads is a separate, much larger
-- change (it needs per-row ownership rules this schema doesn't model yet). This migration is
-- strictly about who may WRITE.
--
-- Deliberately NOT locked, because the browser legitimately writes them and each would need its
-- own API route first: activity_log, admin_notifications, app_settings (already has restrictive
-- policies on its sensitive keys), push_subscriptions, user_dashboard_layout,
-- tailor_worksheet_snapshots, whatsapp_message_log. user_roles keeps its existing
-- self-bootstrap-only INSERT policy from lockdown_user_roles_writes.sql.

DO $$
DECLARE
  tbl  text;
  pol  RECORD;
  tables text[] := ARRAY[
    'orders', 'order_payments', 'order_expenses',
    'customers', 'referral_coupons', 'customer_recommendations',
    'expenses',
    'sales_invoices', 'sales_payments', 'sales_credit_notes', 'sales_quotations',
    'recurring_invoice_profiles', 'document_number_sequences',
    'purchase_bills', 'purchase_orders', 'vendor_payments', 'vendor_credits', 'vendors',
    'products', 'raw_materials', 'inventory_ledger', 'inventory_stock',
    'warehouses', 'units_of_measure',
    'price_lists', 'price_list_items',
    'product_cost_sheets', 'cost_sheet_items', 'bill_of_materials',
    'work_orders',
    'leave_requests', 'leave_types', 'leave_balances', 'leave_balance_adjustments',
    'holidays', 'shop_locations',
    'pos_sessions',
    'chatbot_messages', 'billing_events'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip anything not present in this database (a table belonging to a module that was never
    -- installed), so the migration stays idempotent and safe to re-run.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl
    );

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Drop every policy that can currently authorise a write. An 'ALL' policy covers SELECT
    -- too, so the SELECT policy below is recreated unconditionally afterwards.
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_authenticated', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      tbl || '_select_authenticated', tbl
    );
  END LOOP;
END $$;
