-- One-time backfill: reconstructs order_payments rows for every order that already has money
-- collected (advance > 0) but predates this table, so Day Book/Payment Methods/Payments
-- Received don't lose historical payments once they switch from parsing activity_log text to
-- reading this table directly. Safe to run more than once, and safe to run after some orders
-- have already recorded a real payment through the new code path — any order that already has
-- at least one order_payments row is skipped entirely, never re-processed or duplicated.
--
-- For each qualifying order: every matching "💰 Payment ₹..." activity_log line becomes one real
-- row (cash amount, any "+ ₹N pts" loyalty discount, and method — extracted from the same text
-- shape src/lib/day-book.ts's ORDER_PAYMENT_RE/ORDER_PAYMENT_METHOD_RE already parse; method
-- defaults to 'Other' for rows logged before "via {method}" was added to the action text).
-- pts_redeemed (the points COUNT, not the rupee value) can't be recovered from this text and is
-- left at 0 for these legacy rows — the row can still be deleted, it just won't auto-refund
-- loyalty points if it happens to be one of these.
--
-- Whatever gap remains between the order's real advance and the sum of reconstructed rows
-- (orders that predate logAction coverage, or any other gap) is closed with one final
-- reconciliation row, so SUM(order_payments) per order always equals orders.advance exactly.
DO $$
DECLARE
  v_order  RECORD;
  v_log    RECORD;
  v_cash   NUMERIC;
  v_pts    NUMERIC;
  v_method TEXT;
  v_sum    NUMERIC;
  v_gap    NUMERIC;
BEGIN
  FOR v_order IN
    SELECT id, advance, created_at FROM orders
    WHERE advance > 0 AND NOT EXISTS (SELECT 1 FROM order_payments WHERE order_payments.order_id = orders.id)
  LOOP
    v_sum := 0;

    FOR v_log IN
      SELECT action, created_at, user_email
      FROM activity_log
      WHERE order_id = v_order.id AND action LIKE '💰 Payment ₹%'
      ORDER BY created_at ASC
    LOOP
      v_cash := COALESCE((substring(v_log.action from '₹([0-9]+(\.[0-9]+)?)'))::NUMERIC, 0);
      v_pts  := COALESCE((substring(v_log.action from '\+ ₹([0-9]+(\.[0-9]+)?) pts'))::NUMERIC, 0);
      v_method := COALESCE(substring(v_log.action from 'via (Cash|UPI|Card|Bank Transfer)'), 'Other');

      INSERT INTO order_payments (order_id, amount, pt_discount, pts_redeemed, method, note, created_by, created_at)
      VALUES (v_order.id, v_cash, v_pts, 0, v_method, 'Migrated from activity log', v_log.user_email, v_log.created_at);

      v_sum := v_sum + v_cash + v_pts;
    END LOOP;

    v_gap := v_order.advance - v_sum;
    IF v_gap > 0.01 THEN
      INSERT INTO order_payments (order_id, amount, pt_discount, pts_redeemed, method, note, created_by, created_at)
      VALUES (v_order.id, v_gap, 0, 0, 'Other', 'Migrated balance — original payment itemization unavailable', NULL, v_order.created_at);
    END IF;
  END LOOP;
END $$;
