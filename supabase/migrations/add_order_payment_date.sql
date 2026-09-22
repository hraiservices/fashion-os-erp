-- Stitching-order payments (order_payments, add_order_payments_table.sql) always recorded
-- created_at as whatever NOW() was at insert time -- there was no way to backdate a payment
-- collected earlier and only entered into the system later (a common real-world case: cash
-- collected on delivery day, entered into the app the next morning). Sales invoice payments
-- (sales_payments / record_sales_payment) already accept an explicit date; this brings orders
-- to parity.
--
-- p_paid_at defaults to NOW() so every existing call site (which doesn't pass it yet) keeps
-- exactly its current behavior until the API route and UI are updated to pass a real value.
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
  p_paid_at           TIMESTAMPTZ DEFAULT NOW()
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

  INSERT INTO order_payments (order_id, amount, pt_discount, pts_redeemed, method, note, created_by, created_at)
  VALUES (p_order_id, p_cash_paid, p_pt_discount, p_pts_redeemed, p_method, p_note, p_created_by, COALESCE(p_paid_at, NOW()));

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
