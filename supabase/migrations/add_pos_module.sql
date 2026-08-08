-- Run this once in your Supabase SQL editor
CREATE TABLE IF NOT EXISTS pos_sessions (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  opened_by      TEXT,
  opened_at      TIMESTAMPTZ   DEFAULT NOW(),
  opening_cash   NUMERIC(10,2) NOT NULL DEFAULT 0,
  closed_at      TIMESTAMPTZ,
  closing_cash   NUMERIC(10,2),
  expected_cash  NUMERIC(10,2),
  status         TEXT          NOT NULL DEFAULT 'open',
  notes          TEXT          NOT NULL DEFAULT ''
);

ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON pos_sessions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE sales_payments ADD COLUMN IF NOT EXISTS pos_session_id UUID REFERENCES pos_sessions(id);
