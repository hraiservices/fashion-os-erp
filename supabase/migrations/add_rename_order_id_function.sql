-- Run this once in your Supabase SQL editor.
--
-- Lets a manager change an order's number after it's already been created — e.g. it was
-- auto-numbered but needs to match an old system's records, or a typo slipped through. The
-- order id is the order's actual primary key and everything referencing it (payments, expenses,
-- activity log, notifications, referral coupons, the tailor worksheet's pending-keys snapshot)
-- stores it by value rather than a declared FK (this schema enforces relationships at the API
-- layer), so a plain UPDATE would silently orphan every one of those rows. Same clone-repoint-
-- delete approach as rename_slash_order_id.sql / rename_all_slash_order_ids.sql, just made into
-- a real callable function instead of a one-time script, and driven by caller-supplied ids
-- rather than searching for a specific broken pattern.
CREATE OR REPLACE FUNCTION rename_order_id(p_old_id TEXT, p_new_id TEXT)
RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_row JSONB;
BEGIN
  IF p_old_id = p_new_id THEN
    RAISE EXCEPTION 'New order number is the same as the current one.';
  END IF;

  PERFORM 1 FROM orders WHERE id = p_old_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_old_id;
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE id = p_new_id) THEN
    RAISE EXCEPTION 'Order number % is already in use.', p_new_id;
  END IF;

  SELECT to_jsonb(o) INTO v_row FROM orders o WHERE id = p_old_id;
  v_row := jsonb_set(v_row, '{id}', to_jsonb(p_new_id));
  INSERT INTO orders SELECT * FROM jsonb_populate_record(NULL::orders, v_row);

  UPDATE order_expenses SET order_id = p_new_id WHERE order_id = p_old_id;
  UPDATE order_payments SET order_id = p_new_id WHERE order_id = p_old_id;
  UPDATE activity_log SET order_id = p_new_id WHERE order_id = p_old_id;
  UPDATE admin_notifications SET order_id = p_new_id WHERE order_id = p_old_id;
  UPDATE referral_coupons SET redeemed_order_id = p_new_id WHERE redeemed_order_id = p_old_id;

  -- pending_keys is a JSONB array of "orderId:lineId" strings (garmentKey() in tailor-worksheet.ts)
  UPDATE tailor_worksheet_snapshots
  SET pending_keys = (
    SELECT COALESCE(jsonb_agg(
      CASE WHEN key LIKE p_old_id || ':%'
           THEN p_new_id || substring(key FROM length(p_old_id) + 1)
           ELSE key END
    ), '[]'::jsonb)
    FROM jsonb_array_elements_text(pending_keys) AS key
  )
  WHERE pending_keys::text LIKE '%' || p_old_id || '%';

  DELETE FROM orders WHERE id = p_old_id;

  RETURN QUERY SELECT * FROM orders WHERE id = p_new_id;
END;
$$;
