-- ============================================================================
--  PRE-LIVE VERIFICATION — 100% READ-ONLY. Safe to run on production.
--  Creates nothing, changes nothing, deletes nothing.
--
--  Run this in Supabase → SQL Editor BEFORE letting clients in.
--  Every row must say OK. Any FAIL is a deployment blocker.
-- ============================================================================

-- 1. REQUIRED COLUMNS ────────────────────────────────────────────────────────
-- The app INSERTs these on every order creation. If a column is missing,
-- PostgREST rejects the whole insert and ORDER CREATION IS COMPLETELY BROKEN.
SELECT
  'orders.' || c.col AS required_column,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name=c.col
  ) THEN 'OK' ELSE 'FAIL — run add_stitching_orders_v1_features.sql' END AS status
FROM (VALUES ('booking_source'),('fabric_cost'),('other_cost'),
             ('rework_flag'),('rework_reason'),('rework_flagged_by'),
             ('rework_flagged_at'),('ready_at'),('in_time'),('delivery_time'),
             ('order_type')) AS c(col);

-- 2. REQUIRED TABLES ─────────────────────────────────────────────────────────
SELECT
  t.tbl AS required_table,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=t.tbl
  ) THEN 'OK' ELSE 'FAIL — migration not applied' END AS status
FROM (VALUES ('orders'),('customers'),('employees'),('employee_attendance'),
             ('payroll_runs'),('payslips'),('employee_advances'),
             ('leave_types'),('holidays'),('leave_balances'),
             ('leave_balance_adjustments'),('leave_requests'),
             ('referral_coupons'),('document_number_sequences'),
             ('app_settings'),('activity_log'),('admin_notifications')) AS t(tbl);

-- 3. REQUIRED FUNCTIONS (RPCs the app calls) ─────────────────────────────────
-- A missing function = that feature 500s at runtime.
SELECT
  f.fn AS required_function,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=f.fn
  ) THEN 'OK' ELSE 'FAIL — migration not applied' END AS status
FROM (VALUES ('set_order_stage'),('edit_order'),('record_order_payment'),
             ('award_loyalty_points'),('reserve_loyalty_discount'),
             ('refund_loyalty_discount'),('set_order_rework'),
             ('redeem_referral_coupon'),('release_referral_coupon'),
             ('approve_leave_request'),('next_document_number'),
             ('change_customer_mobile'),('delete_customer_cascade'),
             ('replace_inventory_ledger')) AS f(fn);

-- 4. set_order_stage MUST be the ready_at-stamping version ───────────────────
-- If this says FAIL, the Ready & Uncollected report will silently stay empty
-- forever because ready_at is never populated.
SELECT 'set_order_stage stamps ready_at' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='set_order_stage'
      AND pg_get_functiondef(p.oid) ILIKE '%ready_at%'
  ) THEN 'OK' ELSE 'FAIL — re-run add_stitching_orders_v1_features.sql' END AS status;

-- 5. edit_order MUST accept the newest params ───────────────────────────────
-- edit_order was redefined across 3 migrations. If an older definition won,
-- saving an order edit silently DROPS booking_source/fabric_cost/other_cost.
SELECT 'edit_order accepts booking_source/costs' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='edit_order'
      AND pg_get_functiondef(p.oid) ILIKE '%p_booking_source%'
  ) THEN 'OK' ELSE 'FAIL — re-run add_stitching_orders_v1_features.sql LAST' END AS status;

-- 6. DUPLICATE edit_order OVERLOADS (ambiguity risk) ────────────────────────
-- More than 1 = PostgREST may pick the wrong overload. Should be exactly 1.
SELECT 'edit_order overload count' AS check_name,
       count(*)::text AS value,
       CASE WHEN count(*)=1 THEN 'OK' ELSE 'REVIEW — drop stale overloads' END AS status
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='edit_order';

-- 7. RLS ENABLED ON EVERY BUSINESS TABLE ────────────────────────────────────
-- RLS off = any authenticated user can read/write that table directly.
SELECT tablename,
       CASE WHEN rowsecurity THEN 'OK' ELSE 'FAIL — RLS DISABLED' END AS status
FROM pg_tables
WHERE schemaname='public'
  AND tablename IN ('orders','customers','employees','payslips','payroll_runs',
                    'employee_attendance','employee_advances','leave_requests',
                    'referral_coupons','app_settings','sales_invoices')
ORDER BY rowsecurity, tablename;

-- 8. DATA INTEGRITY — these must all return ZERO rows ───────────────────────

-- 8a. Orders whose stored balance disagrees with total - advance
SELECT 'orders_with_drifted_balance' AS integrity_check, count(*) AS bad_rows
FROM orders WHERE balance IS DISTINCT FROM GREATEST(0, total - advance);

-- 8b. Negative money
SELECT 'orders_negative_money' AS integrity_check, count(*) AS bad_rows
FROM orders WHERE total < 0 OR advance < 0 OR balance < 0;

-- 8c. Overpaid orders (advance exceeds total)
SELECT 'orders_overpaid' AS integrity_check, count(*) AS bad_rows
FROM orders WHERE advance > total;

-- 8d. Orders with no matching customer record (orphans)
SELECT 'orders_orphaned_from_customer' AS integrity_check, count(*) AS bad_rows
FROM orders o WHERE o.mobile IS NOT NULL AND o.mobile <> ''
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.mobile = o.mobile);

-- 8e. Duplicate customers on the same mobile
SELECT 'duplicate_customer_mobiles' AS integrity_check, count(*) AS bad_rows
FROM (SELECT mobile FROM customers WHERE mobile IS NOT NULL AND mobile <> ''
      GROUP BY mobile HAVING count(*) > 1) d;

-- 8f. Negative loyalty balances
SELECT 'customers_negative_loyalty' AS integrity_check, count(*) AS bad_rows
FROM customers WHERE loyalty_points < 0;

-- 8g. Invalid order stages
SELECT 'orders_invalid_status' AS integrity_check, count(*) AS bad_rows
FROM orders
WHERE status NOT IN ('received','cutting','stitching','ready','delivered','payment','trial');

-- 9. PAYLOAD SIZE — the scalability blocker ─────────────────────────────────
-- The orders list downloads EVERY row including base64 images/audio/video.
-- If total_media_mb is more than a few MB, the app is already slow and will
-- get worse every day. This is the single best predictor of "it went unusable".
SELECT
  count(*) AS total_orders,
  pg_size_pretty(pg_total_relation_size('orders')) AS orders_table_size,
  round(COALESCE(sum(
    octet_length(COALESCE(images::text,'')) +
    octet_length(COALESCE(audios::text,'')) +
    octet_length(COALESCE(videos::text,''))
  ),0) / 1048576.0, 2) AS total_media_mb,
  round(COALESCE(avg(
    octet_length(COALESCE(images::text,'')) +
    octet_length(COALESCE(audios::text,'')) +
    octet_length(COALESCE(videos::text,''))
  ),0) / 1024.0, 1) AS avg_media_kb_per_order
FROM orders;

-- 10. ATTENDANCE DATE SANITY (UTC-vs-IST bug detector) ──────────────────────
-- Check-ins recorded between 00:00–05:29 IST get stamped with the PREVIOUS
-- day's date. Any row here means attendance (and therefore payroll) is wrong.
SELECT 'attendance_rows_with_utc_date_skew' AS integrity_check, count(*) AS bad_rows
FROM employee_attendance
WHERE check_in_at IS NOT NULL
  AND date <> (check_in_at AT TIME ZONE 'Asia/Kolkata')::date;
