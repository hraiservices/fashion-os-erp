-- record_order_payment now also writes a real order_payments row (see add_order_payments_table.sql)
-- alongside its existing atomic orders UPDATE — same transaction, same call, nothing else about
-- the function's existing behavior (row lock, stale-advance check, LEAST/GREATEST math) changes.
CREATE OR REPLACE FUNCTION record_order_payment(
  p_order_id         TEXT,
  p_cash_paid        NUMERIC,
  p_pt_discount       NUMERIC,
  p_history_line      TEXT,
  p_expected_advance  NUMERIC DEFAULT NULL,
  p_method            TEXT DEFAULT 'Cash',
  p_note              TEXT DEFAULT '',
  p_created_by        TEXT DEFAULT NULL,
  p_pts_redeemed      INTEGER DEFAULT 0
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_advance NUMERIC;
BEGIN
  IF p_cash_paid < 0 OR p_pt_discount < 0 THEN
    RAISE EXCEPTION 'Payment amounts cannot be negative (cash=%, discount=%)', p_cash_paid, p_pt_discount;
  END IF;

  -- Lock the row before comparing/writing so a second concurrent call can't read the same
  -- pre-payment advance and also pass the check.
  SELECT advance INTO v_advance FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF p_expected_advance IS NOT NULL AND v_advance IS DISTINCT FROM p_expected_advance THEN
    RAISE EXCEPTION 'STALE_ADVANCE: a payment was already recorded for this order (advance is now ₹%, you saw ₹%). Reload and try again.', v_advance, p_expected_advance;
  END IF;

  INSERT INTO order_payments (order_id, amount, pt_discount, pts_redeemed, method, note, created_by)
  VALUES (p_order_id, p_cash_paid, p_pt_discount, p_pts_redeemed, p_method, p_note, p_created_by);

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

-- Reverses a single order_payments row: subtracts it back out of orders.advance/balance
-- (which, unlike sales_invoices' live-derived balance, are cached and don't self-correct when a
-- payment row disappears), symmetrically undoes the delivered->payment auto-transition
-- record_order_payment applies when a payment completes an order, and deletes the row. Does NOT
-- refund loyalty points itself — the caller (the DELETE route) does that via the existing
-- refund_loyalty_discount RPC when the deleted row's pts_redeemed > 0, same compensating-action
-- pattern already used elsewhere for this exact RPC.
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
  v_total        NUMERIC;
  v_new_advance  NUMERIC;
  v_new_balance  NUMERIC;
BEGIN
  SELECT order_id, amount, pt_discount INTO v_order_id, v_amount, v_pt_discount
  FROM order_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  -- Lock the order for the duration, same reason record_order_payment does.
  SELECT total INTO v_total FROM orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', v_order_id;
  END IF;

  DELETE FROM order_payments WHERE id = p_payment_id;

  RETURN QUERY
  UPDATE orders o
  SET
    advance = GREATEST(0, o.advance - v_amount - v_pt_discount),
    balance = LEAST(v_total, v_total - GREATEST(0, o.advance - v_amount - v_pt_discount)),
    -- Symmetric to record_order_payment's forward transition: if this reversal reopens a
    -- balance on an order that had auto-advanced to "payment" purely because it hit zero,
    -- move it back to "delivered" rather than leaving it in a stage that implies fully paid.
    status  = CASE
                WHEN LEAST(v_total, v_total - GREATEST(0, o.advance - v_amount - v_pt_discount)) > 0
                     AND o.status = 'payment'
                THEN 'delivered'
                ELSE o.status
              END,
    history = o.history || to_jsonb(p_history_line)
  WHERE o.id = v_order_id
  RETURNING *;
END;
$$;
