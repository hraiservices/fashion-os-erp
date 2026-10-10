-- rename_order_id() clones an order under its new number and re-points everything that referenced the
-- old one. Targets added two more references it did not know about, so renaming an order broke them:
--   - leads.order_id          (the lead's "View the order" link)
--   - work_tasks.link_id      (a task linked to the order)
-- This is the original function plus those two re-points, nothing else changed.
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

  -- Targets (skipped on a shop that has not run the Targets migrations).
  IF to_regclass('public.leads') IS NOT NULL THEN
    UPDATE leads SET order_id = p_new_id WHERE order_id = p_old_id;
  END IF;
  IF to_regclass('public.work_tasks') IS NOT NULL THEN
    UPDATE work_tasks SET link_id = p_new_id WHERE link_type = 'order' AND link_id = p_old_id;
  END IF;

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
