-- ============================================================================
-- FASHION FLOW — PERFORMANCE FORENSIC DIAGNOSTIC (READ-ONLY)
-- ============================================================================
-- Same rules as the earlier security diagnostic: every statement here is
-- SELECT-only (pg_stat_statements reads are inherently read-only), safe to
-- run against production. Run each numbered section separately in the SQL
-- Editor and paste back its result labeled with its section number.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — Full text of the actual queries behind the reported hotspots
-- ============================================================================
-- The original report gave aggregated stats (calls/mean/max) but not the exact
-- query TEXT or which role/application ran it. This is the single most
-- important section: it tells us whether these are Fashion Flow application
-- queries, PostgREST's own overhead, or Supabase dashboard/tooling traffic.

SELECT
  LEFT(query, 300) AS query_text,
  calls,
  round(total_exec_time::numeric, 1) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(max_exec_time::numeric, 2) AS max_ms,
  rows,
  userid::regrole AS run_as_role
FROM pg_stat_statements
WHERE query ILIKE '%app_settings%'
   OR query ILIKE '%user_roles%'
   OR query ILIKE '%FROM orders%'
   OR query ILIKE '%FROM customers%'
   OR query ILIKE '%order_expenses%'
ORDER BY calls DESC
LIMIT 40;


-- ============================================================================
-- SECTION 2 — Top 20 queries by TOTAL time (not just call count) — this is
-- what actually matters for "why does it feel slow", separate from raw volume
-- ============================================================================

SELECT
  LEFT(query, 200) AS query_text,
  calls,
  round(total_exec_time::numeric, 1) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  userid::regrole AS run_as_role
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;


-- ============================================================================
-- SECTION 3 — Confirm the run_as_role for the big numbers: is this Fashion
-- Flow's own traffic (authenticator/anon/authenticated) or Supabase-internal
-- tooling (supabase_admin, postgres via dashboard, pgbouncer, etc)?
-- ============================================================================

SELECT
  userid::regrole AS role,
  count(*) AS distinct_queries,
  sum(calls) AS total_calls,
  round(sum(total_exec_time)::numeric, 1) AS total_ms
FROM pg_stat_statements
GROUP BY userid
ORDER BY total_ms DESC;


-- ============================================================================
-- SECTION 4 — Real EXPLAIN ANALYZE for the orders list query exactly as the
-- app runs it (src/hooks/use-orders.ts) — proves whether it's actually doing
-- a full seq scan / heavy JSONB re-serialization, or if 28ms mean is just
-- inherent to a 64-row table with wide JSONB columns (likely fine either way,
-- but let's have real numbers instead of guessing)
-- ============================================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, mobile, in_date, delivery_date, in_time, delivery_time, garments, total, advance,
       balance, tailor, status, special, history, measurements, payments, pay_breakdown, order_type,
       booking_source, fabric_cost, other_cost, rework_flag, rework_reason, rework_flagged_by,
       rework_flagged_at, rework_count, ready_at, payables_confirmed_at, payables_confirmed_by,
       piece_rate_paid_at, paid_by_payroll_run_id, group_id, measurement_profile_id,
       measurement_profile_name, created_at, updated_at
FROM orders
ORDER BY created_at DESC
LIMIT 20000;


-- ============================================================================
-- SECTION 5 — Real EXPLAIN ANALYZE proving/disproving the user_roles
-- sequential-scan claim. This runs the exact lookup current_role_name() and
-- has_perm() do internally.
-- ============================================================================

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT role, custom_permissions FROM user_roles
WHERE lower(email) = lower('a-real-user-email-here@example.com');
-- Replace the email above with any real user's email from your user_roles
-- table before running, so the plan reflects an actual lookup rather than a
-- guaranteed-empty one.


-- ============================================================================
-- SECTION 6 — Does user_roles have a usable index for that email lookup?
-- (idx_user_roles_lower_email was flagged as "unused" in the security audit —
-- if THIS is why it shows 0 scans despite 739k seq scans on the same table,
-- that's a real, fixable bug: the index exists but isn't being used, likely
-- because it doesn't match the exact expression the query/RLS policy uses.)
-- ============================================================================

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'user_roles';


-- ============================================================================
-- SECTION 7 — Live table sizes + row counts for every table named in the
-- report, so "is this actually a lot of traffic for this workload" can be
-- judged against real current scale, not assumptions
-- ============================================================================

SELECT
  relname AS table_name,
  n_live_tup AS live_rows,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  n_tup_ins + n_tup_upd + n_tup_del AS total_writes
FROM pg_stat_user_tables
WHERE relname IN ('app_settings', 'user_roles', 'orders', 'customers', 'order_expenses', 'products', 'units_of_measure')
ORDER BY seq_scan DESC;


-- ============================================================================
-- SECTION 8 — Every RLS policy whose USING/WITH CHECK expression calls one of
-- the 5 authorization helper functions WITHOUT wrapping it in a scalar
-- subquery (select fn()) — this is the classic Postgres RLS performance
-- anti-pattern: an unwrapped function call in a policy is re-evaluated once
-- PER ROW the query touches, not once per query. A wrapped `(select fn())`
-- lets the planner treat it as a stable, cacheable sub-plan.
-- ============================================================================

SELECT
  tablename,
  policyname,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression,
  -- crude but effective: true if the helper fn appears WITHOUT being preceded
  -- by "(select " immediately before it anywhere in the expression
  (qual ~* '(current_role_name|current_employee_id|has_perm|is_back_office)\('
    AND qual !~* '\(select\s+(public\.)?(current_role_name|current_employee_id|has_perm|is_back_office)\(') AS qual_unwrapped,
  (with_check ~* '(current_role_name|current_employee_id|has_perm|is_back_office)\('
    AND with_check !~* '\(select\s+(public\.)?(current_role_name|current_employee_id|has_perm|is_back_office)\(') AS with_check_unwrapped
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual ~* '(current_role_name|current_employee_id|has_perm|is_back_office)\('
    OR with_check ~* '(current_role_name|current_employee_id|has_perm|is_back_office)\('
  )
ORDER BY tablename, policyname;


-- ============================================================================
-- SECTION 9 — Current connection/activity snapshot (repeat of the earlier
-- ad hoc check, but structured) — is there evidence of connection pressure
-- or long-running queries RIGHT NOW?
-- ============================================================================

SELECT
  state,
  count(*) AS n,
  max(now() - query_start) AS longest_running
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY n DESC;


-- ============================================================================
-- SECTION 10 — pg_stat_statements collection window (so call-count numbers
-- can be turned into a real "calls per hour" rate instead of a raw total)
-- ============================================================================

SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();
-- (same value as the security audit unless something reset stats since)


-- ============================================================================
-- END OF DIAGNOSTIC SCRIPT
-- ============================================================================
