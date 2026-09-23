-- Customer credit ledger — a customer's prepaid/overpaid balance, usable later against either a
-- stitching order or a sales invoice (the Record Payment page pools both under one payment, so
-- one shared credit balance is simpler and more correct than two separate ones). Distinct from
-- sales_credit_notes (add_sales_module.sql), which is always tied to one specific invoice's
-- returned goods — this is a general-purpose balance, created when a Record Payment's "Amount
-- received" exceeds what was actually applied to the customer's outstanding rows.
--
-- Same cached-balance + audit-ledger shape as customers.loyalty_points / award_loyalty_points()
-- (supabase/award_loyalty_points.sql): a row-locked balance table for atomic issue/redeem, plus
-- an append-only ledger table for the audit trail, rather than re-summing the ledger on every
-- read.
CREATE TABLE IF NOT EXISTS customer_credit_balances (
  customer_mobile TEXT PRIMARY KEY,
  balance         NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_credit_ledger (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_mobile TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('issued', 'redeemed')),
  note            TEXT NOT NULL DEFAULT '',
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_credit_ledger_mobile ON customer_credit_ledger (customer_mobile);

ALTER TABLE customer_credit_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON customer_credit_balances;
CREATE POLICY "authenticated_read" ON customer_credit_balances FOR SELECT TO authenticated USING (true);

ALTER TABLE customer_credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON customer_credit_ledger;
CREATE POLICY "authenticated_read" ON customer_credit_ledger FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policy for `authenticated` on either table — only the server
-- (service-role client, which bypasses RLS) writes, exclusively via the two RPCs below.

CREATE OR REPLACE FUNCTION issue_customer_credit(
  p_mobile     TEXT,
  p_amount     NUMERIC,
  p_note       TEXT DEFAULT '',
  p_created_by TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive (got %)', p_amount;
  END IF;

  INSERT INTO customer_credit_balances (customer_mobile, balance) VALUES (p_mobile, 0)
  ON CONFLICT (customer_mobile) DO NOTHING;

  UPDATE customer_credit_balances SET balance = balance + p_amount, updated_at = NOW()
  WHERE customer_mobile = p_mobile
  RETURNING balance INTO v_balance;

  INSERT INTO customer_credit_ledger (customer_mobile, amount, entry_type, note, created_by)
  VALUES (p_mobile, p_amount, 'issued', p_note, p_created_by);

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION redeem_customer_credit(
  p_mobile     TEXT,
  p_amount     NUMERIC,
  p_note       TEXT DEFAULT '',
  p_created_by TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Redeem amount must be positive (got %)', p_amount;
  END IF;

  -- Row lock serializes concurrent redemptions for the same customer, same reason
  -- record_order_payment locks the order row before comparing/writing.
  SELECT balance INTO v_balance FROM customer_credit_balances WHERE customer_mobile = p_mobile FOR UPDATE;
  IF NOT FOUND OR v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credit balance (available %, tried to redeem %)', COALESCE(v_balance, 0), p_amount;
  END IF;

  UPDATE customer_credit_balances SET balance = balance - p_amount, updated_at = NOW()
  WHERE customer_mobile = p_mobile
  RETURNING balance INTO v_balance;

  INSERT INTO customer_credit_ledger (customer_mobile, amount, entry_type, note, created_by)
  VALUES (p_mobile, p_amount, 'redeemed', p_note, p_created_by);

  RETURN v_balance;
END;
$$;
