-- Tailor piece-rate pay: base columns + a one-time best-effort backfill converting the
-- existing free-text orders.tailor / work_orders.tailor name strings into real employee ids.
-- employees.id is a UUID, so a plain name string can never collide with an already-converted
-- row -- safe to run once. Only converts when exactly one employee shares that name (avoids
-- guessing when names collide); unmatched/ambiguous rows are left as-is and must be manually
-- reassigned via the new tailor dropdowns -- expected, since not every tailor is onboarded as
-- an employee yet.

ALTER TABLE employees   ADD COLUMN IF NOT EXISTS piece_rate_eligible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders      ADD COLUMN IF NOT EXISTS payables_confirmed_at TIMESTAMPTZ;
ALTER TABLE orders      ADD COLUMN IF NOT EXISTS payables_confirmed_by TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS labor_payable_confirmed_at TIMESTAMPTZ;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS labor_payable_confirmed_by TEXT;
ALTER TABLE payslips    ADD COLUMN IF NOT EXISTS piece_rate_pay NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE orders o
SET tailor = e.id::text
FROM employees e
WHERE lower(trim(o.tailor)) = lower(trim(e.name))
  AND o.tailor <> ''
  AND (SELECT COUNT(*) FROM employees e2 WHERE lower(trim(e2.name)) = lower(trim(o.tailor))) = 1;

UPDATE work_orders w
SET tailor = e.id::text
FROM employees e
WHERE lower(trim(w.tailor)) = lower(trim(e.name))
  AND w.tailor <> ''
  AND (SELECT COUNT(*) FROM employees e2 WHERE lower(trim(e2.name)) = lower(trim(w.tailor))) = 1;
