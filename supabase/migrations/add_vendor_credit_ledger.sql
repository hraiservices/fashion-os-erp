-- Vendor credit ledger — a vendor's overpaid balance, usable later against any of that vendor's
-- open bills. Mirrors customer_credit_balances / customer_credit_ledger
-- (add_customer_credit_ledger.sql) exactly, vendor-keyed instead of customer-keyed.
--
-- Distinct from vendor_credits (add_purchases_module.sql or similar), which is always tied to
-- one specific bill's returned goods — this is a general-purpose balance, created when the new
-- vendor Record Payment page's "Amount paid" exceeds what was actually applied across the
-- vendor's selected open bills.
CREATE TABLE IF NOT EXISTS vendor_credit_balances (
  vendor_id  UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_credit_ledger (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  entry_type  TEXT NOT NULL CHECK (entry_type IN ('issued', 'redeemed')),
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendor_credit_ledger_vendor ON vendor_credit_ledger (vendor_id);

ALTER TABLE vendor_credit_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON vendor_credit_balances;
CREATE POLICY "authenticated_read" ON vendor_credit_balances FOR SELECT TO authenticated USING (true);

ALTER TABLE vendor_credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON vendor_credit_ledger;
CREATE POLICY "authenticated_read" ON vendor_credit_ledger FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policy for `authenticated` on either table — only the server
-- (service-role client, which bypasses RLS) writes, exclusively via the two RPCs below.

CREATE OR REPLACE FUNCTION issue_vendor_credit(
  p_vendor_id  UUID,
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

  INSERT INTO vendor_credit_balances (vendor_id, balance) VALUES (p_vendor_id, 0)
  ON CONFLICT (vendor_id) DO NOTHING;

  UPDATE vendor_credit_balances SET balance = balance + p_amount, updated_at = NOW()
  WHERE vendor_id = p_vendor_id
  RETURNING balance INTO v_balance;

  INSERT INTO vendor_credit_ledger (vendor_id, amount, entry_type, note, created_by)
  VALUES (p_vendor_id, p_amount, 'issued', p_note, p_created_by);

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION redeem_vendor_credit(
  p_vendor_id  UUID,
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

  -- Row lock serializes concurrent redemptions for the same vendor, same reason
  -- record_vendor_payment locks the bill row before comparing/writing.
  SELECT balance INTO v_balance FROM vendor_credit_balances WHERE vendor_id = p_vendor_id FOR UPDATE;
  IF NOT FOUND OR v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credit balance (available %, tried to redeem %)', COALESCE(v_balance, 0), p_amount;
  END IF;

  UPDATE vendor_credit_balances SET balance = balance - p_amount, updated_at = NOW()
  WHERE vendor_id = p_vendor_id
  RETURNING balance INTO v_balance;

  INSERT INTO vendor_credit_ledger (vendor_id, amount, entry_type, note, created_by)
  VALUES (p_vendor_id, p_amount, 'redeemed', p_note, p_created_by);

  RETURN v_balance;
END;
$$;
