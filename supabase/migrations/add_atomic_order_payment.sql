-- Atomic payment recording for stitching orders.
-- v2: adds guards for negative cash/discount (H2), and only auto-transitions to
-- 'payment' stage when the order is already at 'delivered' (pre-paid stage bug fix).
CREATE OR REPLACE FUNCTION record_order_payment(
  p_order_id    TEXT,
  p_cash_paid   NUMERIC,
  p_pt_discount NUMERIC,
  p_history_line TEXT
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_cash_paid < 0 OR p_pt_discount < 0 THEN
    RAISE EXCEPTION 'Payment amounts cannot be negative (cash=%, discount=%)', p_cash_paid, p_pt_discount;
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
