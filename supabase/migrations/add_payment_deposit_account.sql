-- Unified "Record Payment" page (src/app/(app)/payments/new) replaces the old customer-first
-- New Payment dialog + separate bulk-payment modal with a single Zoho-style form: one payment
-- date/method/note/deposit-account/reference, applied as manual per-row amounts across a
-- combined table of a customer's outstanding stitching orders and sales invoices.
--
-- "Deposit To" needs somewhere to point at -- this app never had any bank/cash account concept
-- before. payment_accounts is deliberately minimal (name + cash/bank type only, no reconciliation,
-- no chart-of-accounts integration) since that's genuinely all the new form asks for. Seeded with
-- a single default "Cash" row so the dropdown isn't empty for a shop that hasn't set up others.
CREATE TABLE IF NOT EXISTS payment_accounts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'cash' CHECK (type IN ('cash', 'bank')),
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON payment_accounts;
CREATE POLICY "authenticated_read" ON payment_accounts FOR SELECT TO authenticated USING (true);

INSERT INTO payment_accounts (name, type, is_default)
SELECT 'Cash', 'cash', TRUE
WHERE NOT EXISTS (SELECT 1 FROM payment_accounts);

-- Which account a payment was deposited to, and an optional free-text reference (cheque number,
-- UPI transaction id, etc.) -- both new, both optional, on the two payment ledgers this form
-- writes to.
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES payment_accounts(id);
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS reference TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_payments ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES payment_accounts(id);
ALTER TABLE sales_payments ADD COLUMN IF NOT EXISTS reference TEXT NOT NULL DEFAULT '';

-- Full replacement of record_order_payment (see add_order_payment_date.sql for p_paid_at) --
-- adds p_account_id / p_reference, both optional so every existing caller keeps working
-- unchanged until the API route passes real values.
CREATE OR REPLACE FUNCTION record_order_payment(
  p_order_id         TEXT,
  p_cash_paid        NUMERIC,
  p_pt_discount       NUMERIC,
  p_history_line      TEXT,
  p_expected_advance  NUMERIC DEFAULT NULL,
  p_method            TEXT DEFAULT 'Cash',
  p_note              TEXT DEFAULT '',
  p_created_by        TEXT DEFAULT NULL,
  p_pts_redeemed      INTEGER DEFAULT 0,
  p_paid_at           TIMESTAMPTZ DEFAULT NOW(),
  p_account_id        UUID DEFAULT NULL,
  p_reference         TEXT DEFAULT ''
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_advance NUMERIC;
BEGIN
  IF p_cash_paid < 0 OR p_pt_discount < 0 THEN
    RAISE EXCEPTION 'Payment amounts cannot be negative (cash=%, discount=%)', p_cash_paid, p_pt_discount;
  END IF;

  SELECT advance INTO v_advance FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF p_expected_advance IS NOT NULL AND v_advance IS DISTINCT FROM p_expected_advance THEN
    RAISE EXCEPTION 'STALE_ADVANCE: a payment was already recorded for this order (advance is now ₹%, you saw ₹%). Reload and try again.', v_advance, p_expected_advance;
  END IF;

  INSERT INTO order_payments (order_id, amount, pt_discount, pts_redeemed, method, note, created_by, created_at, account_id, reference)
  VALUES (p_order_id, p_cash_paid, p_pt_discount, p_pts_redeemed, p_method, p_note, p_created_by, COALESCE(p_paid_at, NOW()), p_account_id, p_reference);

  RETURN QUERY
  UPDATE orders
  SET
    advance = LEAST(advance + p_cash_paid + p_pt_discount, total),
    balance = GREATEST(0, total - LEAST(advance + p_cash_paid + p_pt_discount, total)),
    status  = CASE
                WHEN GREATEST(0, total - LEAST(advance + p_cash_paid + p_pt_discount, total)) = 0
                     AND status = 'delivered'
                THEN 'payment'
                ELSE status
              END,
    history = history || to_jsonb(p_history_line)
  WHERE id = p_order_id
  RETURNING *;
END;
$$;

-- Full replacement of record_sales_payment -- adds the same two optional params.
CREATE OR REPLACE FUNCTION record_sales_payment(
  p_invoice_id      UUID,
  p_customer_mobile TEXT,
  p_amount          NUMERIC,
  p_method          TEXT,
  p_date            TEXT,
  p_note            TEXT,
  p_pos_session_id  UUID,
  p_created_by      TEXT,
  p_account_id      UUID DEFAULT NULL,
  p_reference       TEXT DEFAULT ''
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_total NUMERIC;
  v_paid NUMERIC;
  v_credited NUMERIC;
  v_balance NUMERIC;
  v_payment_id UUID;
BEGIN
  SELECT total INTO v_total FROM sales_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sales_payments WHERE invoice_id = p_invoice_id;
  SELECT COALESCE(SUM(total), 0) INTO v_credited FROM sales_credit_notes WHERE invoice_id = p_invoice_id;
  v_balance := v_total - v_paid - v_credited;

  IF p_amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'Payment of %s exceeds the outstanding balance of %s', p_amount, v_balance;
  END IF;

  INSERT INTO sales_payments (invoice_id, customer_mobile, amount, method, date, note, pos_session_id, created_by, account_id, reference)
  VALUES (p_invoice_id, p_customer_mobile, p_amount, p_method, p_date, p_note, p_pos_session_id, p_created_by, p_account_id, p_reference)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;
