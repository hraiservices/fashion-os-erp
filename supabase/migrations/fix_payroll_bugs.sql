-- Three real bugs found in a payroll audit:
--
-- 1) Deleting a still-DRAFT payroll run left every included tailor's orders/work-orders
--    permanently stamped piece_rate_paid_at, with no payslip left to show for it. Creating a
--    payroll run marks piece_rate_paid_at the moment payslips are inserted (not only on
--    Finalize) so it can never be double-counted by a later run — but the delete route never
--    reverted that mark, so a wrong-dates draft the admin deleted silently wrote off real money
--    still owed to the tailor: every future run filters on piece_rate_paid_at IS NULL, so that
--    order/work-order could never surface again.
--
--    Fix: a new paid_by_payroll_run_id column records exactly which run paid each row, so
--    deleting a draft run can find and revert exactly those rows (and only those — a FK with
--    ON DELETE SET NULL is a defense-in-depth backstop for any future code path that deletes a
--    payroll_runs row directly, though the app itself explicitly reverts piece_rate_paid_at
--    first since the FK alone would only null the id column, not the paid-at timestamp).
--
-- 2) Piece-rate eligibility for a payroll run was gated on ready_at/completed_at falling within
--    the period — i.e. a tailor's work only counted once the order reached Ready. The owner has
--    been explicit (twice now) that a tailor payable does not depend on order stage: it's owed
--    the moment the order exists, so payroll must be able to pay it out immediately too. Removed
--    that gating; the only remaining scope is piece_rate_paid_at IS NULL ("not yet paid").
--
-- 3) computeGrossPay (src/lib/payroll.ts) only counted EXPLICITLY marked absent/half-day/leave
--    records as unpaid days for a monthly-salary employee — a day with literally no attendance
--    record at all (nobody marked anything) was silently treated as a paid day, as long as at
--    least one attendance record existed somewhere in the period (the existing "zero records at
--    all" guard in the payroll run route only catches the all-missing case). Fixed in
--    src/lib/payroll.ts itself (application code, no SQL here) to treat any day in the period
--    with no attendance record as unpaid, same as an explicit absence.

ALTER TABLE orders      ADD COLUMN IF NOT EXISTS paid_by_payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS paid_by_payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_paid_by_payroll_run_id_idx      ON orders (paid_by_payroll_run_id);
CREATE INDEX IF NOT EXISTS work_orders_paid_by_payroll_run_id_idx ON work_orders (paid_by_payroll_run_id);
