-- Phase 1 of the read lockdown: the identity + permission primitives every read policy needs.
-- Adds no policy of its own and changes no access — it is safe to run on its own, and the
-- three lockdown_reads_*.sql migrations depend on it.
--
-- Why functions and not inline subqueries. Every per-row policy has to answer the same two
-- questions: "which employee is this session" and "does this session hold permission X". Written
-- inline, those subqueries are re-planned and re-executed per row scanned, which on `orders`
-- means a measurable regression on the list, the board and every report. Declared STABLE, the
-- planner evaluates them once per statement and folds the result into the plan.
--
-- Why SECURITY DEFINER. Two reasons, both necessary:
--   1. A policy on user_roles that has to read user_roles to evaluate itself recurses. A
--      DEFINER function is not subject to the caller's policies, so it breaks the cycle.
--   2. After lockdown_reads_per_row.sql, `authenticated` may only read its OWN user_roles row.
--      has_perm() still has to read app_settings.roleDefaultOverrides, which is not
--      self-scoped.
-- The usual DEFINER footguns are closed: neither function takes a value into a query (has_perm's
-- `flag` is a jsonb key lookup, not SQL), both pin search_path, and EXECUTE is granted only to
-- authenticated — never PUBLIC.

-- ── Permission resolution ────────────────────────────────────────────────────
-- A faithful SQL port of resolvePerms() in src/lib/permissions.ts:
--   ROLE_DEFAULTS[role]  ||  app_settings.roleDefaultOverrides[role]  ||  custom_permissions
-- (jsonb `||` is a right-biased shallow merge, which is exactly Object.assign's semantics here.)
--
-- The default matrix is duplicated from TypeScript, which is a real risk: a permission added or
-- flipped in permissions.ts and not here would silently diverge, and the failure mode is
-- someone quietly seeing less — or more — than the UI shows. `src/lib/security-invariants.test.ts`
-- parses the literal below and asserts it matches ROLE_DEFAULTS exactly, so the divergence fails
-- in CI instead.
CREATE OR REPLACE FUNCTION public.rls_role_defaults() RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT '{
    "admin": {
      "addOrder": true, "deleteOrder": true, "editOrder": true, "managePayments": true,
      "editMeasurements": true, "changeStage": true, "viewReports": true,
      "manageCustomers": true, "manageUsers": true, "deleteCustomers": true,
      "manageInventory": true, "managePurchases": true, "manageManufacturing": true,
      "manageSales": true, "useChatbot": true, "manageEmployees": true, "usePOS": true,
      "managePayroll": true
    },
    "manager": {
      "addOrder": true, "deleteOrder": false, "editOrder": true, "managePayments": true,
      "editMeasurements": true, "changeStage": true, "viewReports": true,
      "manageCustomers": true, "manageUsers": false, "deleteCustomers": false,
      "manageInventory": true, "managePurchases": true, "manageManufacturing": true,
      "manageSales": true, "useChatbot": true, "manageEmployees": true, "usePOS": true,
      "managePayroll": false
    },
    "sales": {
      "addOrder": true, "deleteOrder": false, "editOrder": true, "managePayments": false,
      "editMeasurements": true, "changeStage": true, "viewReports": false,
      "manageCustomers": true, "manageUsers": false, "deleteCustomers": false,
      "manageInventory": false, "managePurchases": false, "manageManufacturing": false,
      "manageSales": true, "useChatbot": false, "manageEmployees": false, "usePOS": true,
      "managePayroll": false
    },
    "tailor": {
      "addOrder": false, "deleteOrder": false, "editOrder": false, "managePayments": false,
      "editMeasurements": false, "changeStage": true, "viewReports": false,
      "manageCustomers": false, "manageUsers": false, "deleteCustomers": false,
      "manageInventory": false, "managePurchases": false, "manageManufacturing": true,
      "manageSales": false, "useChatbot": false, "manageEmployees": false, "usePOS": false,
      "managePayroll": false
    }
  }'::jsonb;
$fn$;

-- ── Who is this session ──────────────────────────────────────────────────────
-- Matched case-insensitively: role-bootstrap.ts inserts lower(email), but Supabase Auth returns
-- the address as the user typed it, so an exact match would silently fail for anyone who signed
-- up with a capital letter — and "silently fail" here means "sees nothing".
CREATE OR REPLACE FUNCTION public.current_role_name() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT CASE WHEN r.role IN ('admin', 'manager', 'sales', 'tailor') THEN r.role ELSE 'tailor' END
       FROM user_roles r
      WHERE lower(r.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      LIMIT 1),
    'tailor');
$fn$;

/** The employees row this login is linked to (user_roles.linked_employee_id), or NULL.
 *  NULL is load-bearing: `employee_id = current_employee_id()` is NULL, not true, for a login
 *  with no staff record, so an unlinked account matches no rows rather than all of them. */
CREATE OR REPLACE FUNCTION public.current_employee_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.linked_employee_id
    FROM user_roles r
   WHERE lower(r.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
   LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.has_perm(flag text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    ((
      (public.rls_role_defaults() -> public.current_role_name())
      || COALESCE(
           (SELECT s.value FROM app_settings s WHERE s.key = 'roleDefaultOverrides')
             -> public.current_role_name(),
           '{}'::jsonb)
      || COALESCE(
           (SELECT r.custom_permissions FROM user_roles r
             WHERE lower(r.email) = lower(COALESCE(auth.jwt() ->> 'email', '')) LIMIT 1),
           '{}'::jsonb)
    ) ->> flag)::boolean,
    false);
$fn$;

/** Admin/manager — the two roles isRestrictedRole() lets past RESTRICTED_ROUTE_PREFIXES.
 *  Used where the boundary is genuinely "back office", not a single named permission. */
CREATE OR REPLACE FUNCTION public.is_back_office() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.current_role_name() IN ('admin', 'manager');
$fn$;

-- Never PUBLIC: these read user_roles and app_settings with the definer's privileges, so `anon`
-- must not be able to call them at all.
REVOKE ALL ON FUNCTION public.rls_role_defaults()   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_role_name()   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_employee_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_perm(text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_back_office()      FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rls_role_defaults()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_role_name()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_perm(text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_back_office()      TO authenticated, service_role;

-- ── Indexes the per-row policies need ────────────────────────────────────────
-- A policy predicate is ANDed into every query against the table, so a per-row rule on an
-- unindexed column turns each of these tables into a sequential scan on every read.
CREATE INDEX IF NOT EXISTS idx_user_roles_lower_email      ON user_roles (lower(email));
CREATE INDEX IF NOT EXISTS idx_orders_tailor               ON orders (tailor);
CREATE INDEX IF NOT EXISTS idx_work_orders_tailor          ON work_orders (tailor);
CREATE INDEX IF NOT EXISTS idx_payslips_employee_id        ON payslips (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_employee  ON employee_advances (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id      ON employee_attendance (employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id  ON leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_opened_by      ON pos_sessions (opened_by);
