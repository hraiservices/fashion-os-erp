-- Deleting an employee (Employees → [name] → Delete) was failing outright with a raw Postgres
-- error surfaced straight to the screen:
--   update or delete on table "employees" violates foreign key constraint
--   "tailor_worksheet_snapshots_tailor_id_fkey" on table "tailor_worksheet_snapshots"
--
-- tailor_worksheet_snapshots is disposable cached report data (see
-- add_tailor_worksheet_snapshots.sql — "regenerating the same day just updates that row"), not a
-- real business record, so there's nothing to preserve: deleting the employee should just take
-- their stale snapshot rows with them. Every other employees(id) reference already has ON DELETE
-- CASCADE (attendance/leave/payroll) except this one and manager_id, which hits the exact same
-- class of bug (an ex-employee who used to manage someone else can never be deleted) — fixed here
-- too, as SET NULL rather than CASCADE since deleting the manager shouldn't delete their reports.
ALTER TABLE tailor_worksheet_snapshots DROP CONSTRAINT IF EXISTS tailor_worksheet_snapshots_tailor_id_fkey;
ALTER TABLE tailor_worksheet_snapshots
  ADD CONSTRAINT tailor_worksheet_snapshots_tailor_id_fkey
  FOREIGN KEY (tailor_id) REFERENCES employees(id) ON DELETE CASCADE;

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_manager_id_fkey;
ALTER TABLE employees
  ADD CONSTRAINT employees_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL;
