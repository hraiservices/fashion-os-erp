-- Two P0 bugs found in a pre-go-live forensic audit.
--
-- 1) delete_order_payment's balance clamp was backwards. It computed
--      balance = LEAST(v_total, v_total - GREATEST(0, new_advance))
--    but GREATEST(0, new_advance) is always >= 0, so v_total - GREATEST(0, new_advance) is
--    always <= v_total — the outer LEAST(v_total, ...) never actually did anything. On an
--    overpaid order (advance > total — confirmed to exist in production, see
--    fix_edit_order_numeric_and_overpay_guard.sql), deleting a payment could drive balance
--    NEGATIVE and permanently, since nothing floors it at 0. A negative balance also silently
--    defeats the payment->delivered status-reversal check right below it (it only fires when
--    the recomputed balance is > 0).
--
-- 2) record_order_payment has TWO stale overloads still live in the database (4-param from
--    add_atomic_order_payment.sql, 5-param from add_payment_idempotency.sql) — CREATE OR
--    REPLACE only replaces a function with an IDENTICAL signature, so adding parameters over
--    three migrations created three coexisting overloads, never cleaned up (the same mistake
--    already caught and fixed once for edit_order). The two old ones skip the order_payments
--    ledger insert entirely and skip the stale-advance check, yet still mutate
--    orders.advance/balance/status if ever invoked directly — reintroducing the exact "advance
--    moved with no ledger row behind it" gap the ledger exists to close.
DROP FUNCTION IF EXISTS record_order_payment(TEXT, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS record_order_payment(TEXT, NUMERIC, NUMERIC, TEXT, NUMERIC);

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
  SELECT total, advance INTO v_total, v_new_advance FROM orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', v_order_id;
  END IF;

  DELETE FROM order_payments WHERE id = p_payment_id;

  -- Floor advance at 0 (can't go negative), THEN floor balance at 0 separately (total minus
  -- advance can still be negative on an already-overpaid order — that must clamp to 0, not
  -- propagate as a negative balance).
  v_new_advance := GREATEST(0, v_new_advance - v_amount - v_pt_discount);
  v_new_balance := GREATEST(0, v_total - v_new_advance);

  RETURN QUERY
  UPDATE orders o
  SET
    advance = v_new_advance,
    balance = v_new_balance,
    -- Symmetric to record_order_payment's forward transition: if this reversal reopens a
    -- balance on an order that had auto-advanced to "payment" purely because it hit zero,
    -- move it back to "delivered" rather than leaving it in a stage that implies fully paid.
    status  = CASE
                WHEN v_new_balance > 0 AND o.status = 'payment'
                THEN 'delivered'
                ELSE o.status
              END,
    history = o.history || to_jsonb(p_history_line)
  WHERE o.id = v_order_id
  RETURNING *;
END;
$$;

-- Replaces the two-round-trip check-then-insert in the backfill-payment API route, which had
-- no lock: a double-click (or two tabs) could both read "0 existing payments" before either
-- insert landed, creating two ledger rows for the same legacy advance and permanently
-- overstating SUM(order_payments) with no way to reconcile it back down. Row-locking the order
-- for the duration serializes concurrent attempts the same way every other payment mutation
-- already does.
CREATE OR REPLACE FUNCTION backfill_order_payment(
  p_order_id    TEXT,
  p_method      TEXT DEFAULT 'Other',
  p_note        TEXT DEFAULT 'Backfilled — recorded before the payment ledger existed',
  p_created_by  TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_advance NUMERIC;
  v_existing_count INTEGER;
  v_payment_id UUID;
BEGIN
  SELECT advance INTO v_advance FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;
  IF v_advance <= 0 THEN
    RAISE EXCEPTION 'This order has no advance to backfill';
  END IF;

  SELECT COUNT(*) INTO v_existing_count FROM order_payments WHERE order_id = p_order_id;
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'This order already has payment records';
  END IF;

  INSERT INTO order_payments (order_id, amount, pt_discount, pts_redeemed, method, note, created_by)
  VALUES (p_order_id, v_advance, 0, 0, p_method, p_note, p_created_by)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;
