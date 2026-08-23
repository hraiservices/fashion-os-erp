-- record_order_payment previously had no way to detect a duplicate submission — a slow
-- network + a retried "Record Payment" click (or two devices/staff acting on the same order
-- at once) both land, and LEAST(advance + cash, total) applies the same cash twice. Adds the
-- same optimistic-concurrency check edit_order already uses: the client sends the advance
-- value it last saw: if the stored advance has moved on since, the whole payment is rejected
-- rather than silently double-applied. p_expected_advance defaults to NULL so any caller that
-- doesn't pass it (there are none left after this migration, but keeps the signature safe)
-- skips the check rather than breaking.
CREATE OR REPLACE FUNCTION record_order_payment(
  p_order_id         TEXT,
  p_cash_paid        NUMERIC,
  p_pt_discount       NUMERIC,
  p_history_line      TEXT,
  p_expected_advance  NUMERIC DEFAULT NULL
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
