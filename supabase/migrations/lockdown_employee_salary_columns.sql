-- Phase 4 of the read lockdown: the salary columns on `employees`.
--
-- `employees` cannot be scoped per row — the tailor dropdown, the "assigned to" label on every
-- order, the attendance sheet and the payroll screen all resolve staff names from it, so a
-- policy that hid other people's rows would break the app for exactly the roles this exercise
-- protects. What actually needs hiding is three columns, and RLS has no way to say that: a
-- policy filters rows, never columns.
--
-- Column-level GRANTs do. Same technique as lockdown_pin_hash_columns.sql, and the same trap:
-- a table-level SELECT grant implies every column, present and future, so REVOKing one column
-- alone is a silent no-op. The whole table grant has to come off and be handed back column by
-- column.
--
-- src/hooks/use-employees.ts has always asked for salary_type/salary_rate only when the caller
-- holds managePayroll — but that was the browser policing itself, and a request it declines to
-- send is a request anyone can send by hand. The columns are now unreadable by `authenticated`
-- outright; the payroll screen gets them from GET /api/employees, which checks managePayroll and
-- reads with the service-role client.
--
-- Kept deliberately readable: name, mobile, role, active, commission_*, location_id — the staff
-- directory the app is built on. `commission_rate` is a rate, not a pay figure, and the order
-- form needs it.

DO $$
DECLARE
  cols text;
  hidden CONSTANT text[] := ARRAY[
    -- credentials, already closed by lockdown_pin_hash_columns.sql — repeated so this migration
    -- is self-contained and cannot hand them back by rebuilding the grant without them
    'pin_hash', 'failed_pin_attempts', 'pin_locked_until',
    -- compensation
    'salary_type', 'salary_rate', 'piece_rate_eligible'
  ];
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'employees'
     AND column_name <> ALL (hidden);

  -- A NULL here would mean the table has no readable columns left, which can only happen if the
  -- lookup failed. Granting nothing back would lock every staff screen out of the app, so stop
  -- rather than half-apply.
  IF cols IS NULL THEN
    RAISE EXCEPTION 'Could not enumerate public.employees columns — refusing to revoke SELECT';
  END IF;

  EXECUTE 'REVOKE SELECT ON public.employees FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.employees TO authenticated', cols);
END $$;
