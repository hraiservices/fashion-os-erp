-- Run this once in your Supabase SQL editor

-- Salary fields on employees (lightweight: single fixed rate, not a component breakdown)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_type TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_rate NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Advances/loans given to an employee — deducted from their next payslip once linked.
CREATE TABLE IF NOT EXISTS employee_advances (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  amount      NUMERIC(10,2) NOT NULL,
  note        TEXT          NOT NULL DEFAULT '',
  payslip_id  UUID,
  created_by  TEXT,
  created_at  TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON employee_advances
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- One payroll run per pay period, generating a payslip per active employee.
CREATE TABLE IF NOT EXISTS payroll_runs (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  period_start  DATE          NOT NULL,
  period_end    DATE          NOT NULL,
  status        TEXT          NOT NULL DEFAULT 'draft',
  created_by    TEXT,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  finalized_at  TIMESTAMPTZ,
  notes         TEXT          NOT NULL DEFAULT ''
);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON payroll_runs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS payslips (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_run_id  UUID          NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id     UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  present_days    NUMERIC(5,1)  NOT NULL DEFAULT 0,
  absent_days     NUMERIC(5,1)  NOT NULL DEFAULT 0,
  half_days       NUMERIC(5,1)  NOT NULL DEFAULT 0,
  leave_days      NUMERIC(5,1)  NOT NULL DEFAULT 0,
  gross_pay       NUMERIC(10,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_pay         NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          TEXT          NOT NULL DEFAULT 'draft',
  paid_at         TIMESTAMPTZ,
  notes           TEXT          NOT NULL DEFAULT '',
  UNIQUE (payroll_run_id, employee_id)
);

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON payslips
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE employee_advances ADD CONSTRAINT employee_advances_payslip_id_fkey FOREIGN KEY (payslip_id) REFERENCES payslips(id) ON DELETE SET NULL;
