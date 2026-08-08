-- Run this once in your Supabase SQL editor
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  category    TEXT          NOT NULL,
  description TEXT          NOT NULL DEFAULT '',
  amount      NUMERIC(10,2) NOT NULL,
  pay_method  TEXT          NOT NULL DEFAULT 'Cash',
  created_by  TEXT,
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON expenses
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
