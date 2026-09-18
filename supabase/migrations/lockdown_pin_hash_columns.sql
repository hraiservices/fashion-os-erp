-- CRITICAL, confirmed-exploitable account takeover — the read-side counterpart to
-- lockdown_user_roles_writes.sql, which closed the WRITE escalation on user_roles and
-- deliberately left SELECT open ("every request still needs to read its own row"). The problem
-- is that the SELECT policy grants EVERY row, and both user_roles and employees carry
-- `pin_hash` — a bcrypt hash of a 4-6 digit PIN (src/lib/attendance-auth.ts, PIN_REGEX
-- /^\d{4,6}$/, bcrypt cost 10).
--
-- The full chain, all of it reachable by a tailor whose permissions are every-flag-false:
--   1. Log in normally. The browser holds a real `authenticated` Supabase session.
--   2. From the console, with the session the app already holds:
--        await supabase.from('user_roles').select('email, phone, pin_hash, role')
--        await supabase.from('employees').select('id, name, pin_hash')
--      Both return EVERY row — RLS is `USING (true)`.
--   3. Crack the admin's PIN offline. A 4-digit PIN is 10,000 candidates; the 5-attempt /
--      15-minute lockout in the login routes is a SERVER-side counter and never applies to an
--      offline attack on a hash you already hold.
--   4. POST /api/auth/phone-login with the admin's phone + the cracked PIN. That route mints a
--      REAL Supabase Auth session for the admin's account (admin.generateLink + verifyOtp), so
--      the attacker is now the admin everywhere — getServerUser() resolves every permission in
--      the app from that session.
--
-- The application code was already careful here and it did not help: use-employees.ts and
-- use-user-roles.ts both use explicit column lists that deliberately omit pin_hash, with
-- comments saying so. That is a convention in the app's own queries, not an enforcement — it
-- constrains the queries the APP makes, not the ones the SESSION is allowed to make.
--
-- Fix: take table-level SELECT away from `authenticated` (in PostgreSQL a table-level SELECT
-- privilege implies every column, so a column-level REVOKE alone would be a no-op) and grant it
-- back column-by-column for everything EXCEPT the three credential columns. Generated from
-- information_schema rather than a hardcoded list so this cannot silently disagree with the
-- real table shape. Verified beforehand that no client-side query does `select('*')` on either
-- table — every one names its columns — and the two server routes that did (payroll/run and the
-- payslip PDF) are moved to the service-role client in the same change.
--
-- `anon` is untouched: every RLS policy on both tables is `TO authenticated`, so an
-- unauthenticated caller is already denied by RLS regardless of grants.
--
-- service_role is unaffected — it is a separate role with its own grants, which is why the
-- legitimate PIN readers (attendance/login, auth/phone-login, user-roles/phone-check, and the
-- two routes converted alongside this migration) keep working.

DO $$
DECLARE
  tbl  text;
  cols text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['user_roles', 'employees'] LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = tbl
       AND column_name NOT IN ('pin_hash', 'failed_pin_attempts', 'pin_locked_until');

    IF cols IS NULL THEN
      RAISE EXCEPTION 'No grantable columns resolved for public.% — refusing to revoke SELECT', tbl;
    END IF;

    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated', tbl);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', cols, tbl);
  END LOOP;
END $$;
