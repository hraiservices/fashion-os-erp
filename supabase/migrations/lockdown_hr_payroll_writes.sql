-- Same class of hole as lockdown_user_roles_writes.sql, on the HR/compensation tables: their
-- RLS is the project default (`FOR ALL TO authenticated USING (true) WITH CHECK (true)`), so
-- every server-side guard protecting pay is bypassable from the browser console with the
-- session the app already holds. Confirmed reachable by a tailor with every permission false:
--
--   -- give yourself a raise; /api/employees/[id] never runs, so manageEmployees never checked
--   supabase.from('employees').update({ salary_rate: 999999 }).eq('id', myId)
--
--   -- mark yourself present for a month you didn't work. /api/payroll/run reads exactly these
--   -- rows (countAttendance -> computeGrossPay), so this is paid out as real money — for a
--   -- daily-rate employee it is a straight per-day multiplier.
--   supabase.from('employee_attendance').upsert({ employee_id: myId, date: '...', status: 'present' })
--
--   -- rewrite a finalised payslip, or clear the advances that were deducted from it
--   supabase.from('payslips').update({ net_pay: 50000, deductions: 0 }).eq('id', ...)
--   supabase.from('employee_advances').delete().eq('employee_id', myId)
--
-- All of the careful work in /api/payroll/run — the managePayroll check, the advance budgeting
-- that stops a shortfall being silently written off, the duplicate-period guard, the "no
-- attendance means zero, never full salary" rule — only protects the path the app's own UI
-- takes. None of it is in the way of the statements above.
--
-- Fix: block INSERT/UPDATE/DELETE for `authenticated` on these five tables and keep SELECT
-- exactly as permissive as it is today, so every existing client-side read (the payroll pages,
-- the attendance grid, useEmployees across the app) keeps working untouched. Writes now have to
-- go through the API routes, which already carry the permission checks — those routes are moved
-- onto the service-role client in the same change, plus a new POST /api/attendance/mark to
-- replace the direct browser upsert that useMarkAttendance was doing.
--
-- Deliberately scoped to the HR/comp cluster rather than all 44 permissive tables: server routes
-- authenticate as `authenticated` too (getServerUser() hands back the cookie-scoped client), so
-- a table's writes can only be locked once every route that writes it has been moved to the
-- service-role client. That is done here for these five; the rest of the schema still needs the
-- same treatment.

DO $$
DECLARE
  tbl text;
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['employees', 'employee_attendance', 'employee_advances', 'payroll_runs', 'payslips'] LOOP
    -- Drop every policy that can currently authorise a write. An 'ALL' policy covers SELECT
    -- too, so the SELECT policy below has to be recreated unconditionally afterwards.
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
