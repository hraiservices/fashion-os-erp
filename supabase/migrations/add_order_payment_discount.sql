-- "Discount option in Record Payment" — staff can write off part of a stitching order's
-- balance (a goodwill discount, a small negotiated shortfall) at the moment they collect a
-- payment, without it being counted as cash actually received. Modeled exactly on the existing
-- loyalty-points discount (pt_discount): its own column, its own history-line marker, settles
-- balance the same way, excluded from Day Book / payment-method cash totals (those only ever
-- summed order_payments.amount) the same way pt_discount already is.
--
-- Scoped to stitching orders only, not sales invoices — an invoice's balance reduction already
-- has a correct, GST-aware path (credit notes, which also restore stock for the returned line
-- items), and a quick cash-value discount doesn't fit that shape without either skipping GST
-- netting or fabricating a fake line item. Revisit if customers need it on invoices too.

ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Adding a new parameter changes the signature, and CREATE OR REPLACE only replaces a function
-- with an IDENTICAL signature — leaving the old 12-param overload live was exactly the bug
-- fix_payment_ledger_p0_bugs.sql found and fixed once already for this same function. Drop it
-- explicitly rather than repeat that mistake.
DROP FUNCTION IF EXISTS record_order_payment(TEXT, NUMERIC, NUMERIC, TEXT, NUMERIC, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ, UUID, TEXT);

-- Full replacement of record_order_payment (see add_payment_deposit_account.sql for the
-- previous version) -- adds p_discount, optional so every existing caller keeps working
-- unchanged until the API route passes a real value.
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
  p_reference         TEXT DEFAULT '',
  p_discount           NUMERIC DEFAULT 0
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_advance NUMERIC;
BEGIN
  IF p_cash_paid < 0 OR p_pt_discount < 0 OR p_discount < 0 THEN
    RAISE EXCEPTION 'Payment amounts cannot be negative (cash=%, pt_discount=%, discount=%)', p_cash_paid, p_pt_discount, p_discount;
  END IF;

  SELECT advance INTO v_advance FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF p_expected_advance IS NOT NULL AND v_advance IS DISTINCT FROM p_expected_advance THEN
    RAISE EXCEPTION 'STALE_ADVANCE: a payment was already recorded for this order (advance is now ₹%, you saw ₹%). Reload and try again.', v_advance, p_expected_advance;
  END IF;

  INSERT INTO order_payments (order_id, amount, pt_discount, pts_redeemed, method, note, created_by, created_at, account_id, reference, discount)
  VALUES (p_order_id, p_cash_paid, p_pt_discount, p_pts_redeemed, p_method, p_note, p_created_by, COALESCE(p_paid_at, NOW()), p_account_id, p_reference, p_discount);

  RETURN QUERY
  UPDATE orders
  SET
    advance = LEAST(advance + p_cash_paid + p_pt_discount + p_discount, total),
    balance = GREATEST(0, total - LEAST(advance + p_cash_paid + p_pt_discount + p_discount, total)),
    status  = CASE
                WHEN GREATEST(0, total - LEAST(advance + p_cash_paid + p_pt_discount + p_discount, total)) = 0
                     AND status = 'delivered'
                THEN 'payment'
                ELSE status
              END,
    history = history || to_jsonb(p_history_line)
  WHERE id = p_order_id
  RETURNING *;
END;
$$;

-- Full replacement of delete_order_payment -- reverses p_discount the same way it already
-- reverses pt_discount.
CREATE OR REPLACE FUNCTION delete_order_payment(
  p_payment_id    UUID,
  p_history_line  TEXT
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id     TEXT;
  v_amount       NUMERIC;
  v_pt_discount  NUMERIC;
  v_discount     NUMERIC;
  v_total        NUMERIC;
  v_new_advance  NUMERIC;
  v_new_balance  NUMERIC;
BEGIN
  SELECT order_id, amount, pt_discount, discount INTO v_order_id, v_amount, v_pt_discount, v_discount
  FROM order_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  -- Lock the order for the duration, same reason record_order_payment does.
  SELECT total, advance INTO v_total, v_new_advance FROM orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', v_order_id;
  END IF;

  DELETE FROM order_payments WHERE id = p_payment_id;

  -- Floor advance at 0 (can't go negative), THEN floor balance at 0 separately (total minus
  -- advance can still be negative on an already-overpaid order — that must clamp to 0, not
  -- propagate as a negative balance).
  v_new_advance := GREATEST(0, v_new_advance - v_amount - v_pt_discount - COALESCE(v_discount, 0));
  v_new_balance := GREATEST(0, v_total - v_new_advance);

  RETURN QUERY
  UPDATE orders o
  SET
    advance = v_new_advance,
    balance = v_new_balance,
    -- Symmetric to record_order_payment's forward transition: if this reversal reopens a
    -- balance on an order that had auto-advanced to "payment" purely because it hit zero,
    -- move it back to "delivered" rather than leaving it stuck on "payment" with money owed.
    status  = CASE WHEN v_new_balance > 0 AND o.status = 'payment' THEN 'delivered' ELSE o.status END,
    history = o.history || to_jsonb(p_history_line)
  WHERE o.id = v_order_id
  RETURNING *;
END;
$$;
