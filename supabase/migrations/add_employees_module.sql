-- Run this once in your Supabase SQL editor
CREATE TABLE IF NOT EXISTS employees (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT          NOT NULL,
  mobile          TEXT          NOT NULL DEFAULT '',
  role            TEXT          NOT NULL DEFAULT '',
  employment_type TEXT          NOT NULL DEFAULT 'full_time',
  commission_type TEXT          NOT NULL DEFAULT 'none',
  commission_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  active          BOOLEAN       NOT NULL DEFAULT true,
  joined_date     DATE,
  notes           TEXT          NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON employees
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS employee_attendance (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'present',
  check_in    TIME,
  check_out   TIME,
  notes       TEXT        NOT NULL DEFAULT '',
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

ALTER TABLE employee_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON employee_attendance
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
