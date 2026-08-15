-- Leave Management (Phase 1 of the HR system build).
-- Run this once in your Supabase SQL editor.
--
-- Design notes:
--  * leave_balances stores ALLOCATION only (annual + carried-forward days). "Used" is always
--    derived by summing approved leave_requests.days — never trusted from a stored counter,
--    same principle as order.balance in business-rules.ts ("balance is always derived").
--  * leave_balance_adjustments is an audited ledger (mirrors loyalty_history) — admin
--    corrections are inserted as rows with a reason, never an in-place UPDATE to a balance.
--  * Approving a request writes employee_attendance.status='leave' for each in-range date
--    (skipping weekly-offs/holidays and dates that already have real attendance) — this reuses
--    employee_attendance as the single source of truth for "present/absent/leave on date X",
--    so payroll's existing countAttendance() picks up approved leave with zero code changes.
--  * Payroll does NOT yet distinguish paid vs unpaid leave types — that's a later phase.

CREATE TABLE IF NOT EXISTS leave_types (
  id                     UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  name                   TEXT          NOT NULL,
  annual_days            NUMERIC(5,1)  NOT NULL DEFAULT 0,
  paid                   BOOLEAN       NOT NULL DEFAULT true,
  carry_forward          BOOLEAN       NOT NULL DEFAULT false,
  max_carry_forward_days NUMERIC(5,1),
  active                 BOOLEAN       NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON leave_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS holidays (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  date       DATE        NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date)
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON holidays FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS leave_balances (
  id                    UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id           UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id         UUID         NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year                  INTEGER      NOT NULL,
  allocated_days        NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_forward_days  NUMERIC(5,1) NOT NULL DEFAULT 0,
  UNIQUE (employee_id, leave_type_id, year)
);

ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON leave_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS leave_balance_adjustments (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID         NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year          INTEGER      NOT NULL,
  days          NUMERIC(5,1) NOT NULL, -- positive or negative
  reason        TEXT         NOT NULL,
  created_by    TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE leave_balance_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON leave_balance_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS leave_requests (
  id                UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id       UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id     UUID         NOT NULL REFERENCES leave_types(id),
  from_date         DATE         NOT NULL,
  to_date           DATE         NOT NULL,
  half_day          BOOLEAN      NOT NULL DEFAULT false, -- only meaningful when from_date = to_date
  days              NUMERIC(5,1) NOT NULL,                -- computed at submission, excludes weekly-offs/holidays
  reason            TEXT         NOT NULL DEFAULT '',
  status            TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by      TEXT         NOT NULL DEFAULT '',      -- 'self-service' or the admin's email
  requested_at      TIMESTAMPTZ  DEFAULT NOW(),
  decided_by        TEXT,
  decided_at        TIMESTAMPTZ,
  rejection_reason  TEXT,
  CHECK (to_date >= from_date)
);
CREATE INDEX IF NOT EXISTS leave_requests_employee_status_idx ON leave_requests (employee_id, status);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON leave_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Minimal org-structure addition — unblocks future manager-scoped approval filtering.
-- Not yet wired into any permission check (see plan notes); approval today is gated
-- purely by the manageEmployees permission.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id);

-- Atomically approve a pending leave request and mark the covered dates as 'leave' in
-- employee_attendance, skipping weekly-offs, holidays, and dates that already carry real
-- (non-leave) attendance with a check-in — those are left untouched rather than overwritten.
CREATE OR REPLACE FUNCTION approve_leave_request(
  p_leave_request_id UUID,
  p_decided_by        TEXT
) RETURNS SETOF leave_requests
LANGUAGE plpgsql
AS $$
DECLARE
  v_req             leave_requests%ROWTYPE;
  v_weekly_off_day  INTEGER;
  v_cur_date        DATE;
BEGIN
  SELECT * INTO v_req FROM leave_requests WHERE id = p_leave_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request not found: %', p_leave_request_id;
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Leave request is not pending (status=%)', v_req.status;
  END IF;

  SELECT COALESCE((value->>'weeklyOffDay')::INTEGER, -1)
    INTO v_weekly_off_day
    FROM app_settings WHERE key = 'attendanceSettings';
  v_weekly_off_day := COALESCE(v_weekly_off_day, -1); -- -1 = no weekly off configured

  v_cur_date := v_req.from_date;
  WHILE v_cur_date <= v_req.to_date LOOP
    IF EXTRACT(DOW FROM v_cur_date)::INTEGER IS DISTINCT FROM v_weekly_off_day
       AND NOT EXISTS (SELECT 1 FROM holidays WHERE date = v_cur_date AND active)
       AND NOT EXISTS (
         SELECT 1 FROM employee_attendance
         WHERE employee_id = v_req.employee_id AND date = v_cur_date
           AND status <> 'leave' AND check_in_at IS NOT NULL
       )
    THEN
      INSERT INTO employee_attendance (employee_id, date, status, source, notes)
      VALUES (v_req.employee_id, v_cur_date, 'leave', 'manual', 'Approved leave request ' || p_leave_request_id)
      ON CONFLICT (employee_id, date) DO UPDATE SET status = 'leave', notes = EXCLUDED.notes;
    END IF;
    v_cur_date := v_cur_date + INTERVAL '1 day';
  END LOOP;

  RETURN QUERY
  UPDATE leave_requests
  SET status = 'approved', decided_by = p_decided_by, decided_at = NOW(), rejection_reason = NULL
  WHERE id = p_leave_request_id
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_leave_request(UUID, TEXT) TO authenticated;
