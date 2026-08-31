-- One-time fix: the "SOR/2026/0191" order was created while the Document Numbering default
-- separator was "/", which becomes part of the order's actual id — and since that id is used
-- verbatim as a URL segment (/orders/[id]), the slash 404s the order's own page. The default
-- separator is now "-" going forward (see document-numbering.ts), but this specific order still
-- has the broken id and needs a one-time rename to match the new format.
--
-- Renaming a primary key that other tables reference by value (not a declared FK — this schema
-- enforces relationships at the API layer, not via DB constraints, so there's nothing to defer)
-- is done as clone-repoint-delete rather than a plain UPDATE, so it's safe regardless of whether
-- a constraint exists: insert a new orders row under the new id (an exact copy via jsonb, so it
-- can't drift from the real column list), repoint every table that stores this order's id by
-- value, then delete the old row. All in one transaction — either it all lands or none does.
DO $$
DECLARE
  v_old_id TEXT := 'SOR/2026/0191';
  v_new_id TEXT := 'SOR-2026-0191';
  v_row JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = v_old_id) THEN
    RAISE NOTICE 'Order % not found — nothing to rename (already fixed, or never existed).', v_old_id;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE id = v_new_id) THEN
    RAISE EXCEPTION 'Target id % already exists — resolve the collision manually before re-running.', v_new_id;
  END IF;

  SELECT to_jsonb(o) INTO v_row FROM orders o WHERE id = v_old_id;
  v_row := jsonb_set(v_row, '{id}', to_jsonb(v_new_id));
  INSERT INTO orders SELECT * FROM jsonb_populate_record(NULL::orders, v_row);

  UPDATE order_expenses SET order_id = v_new_id WHERE order_id = v_old_id;
  UPDATE order_payments SET order_id = v_new_id WHERE order_id = v_old_id;
  UPDATE activity_log SET order_id = v_new_id WHERE order_id = v_old_id;
  UPDATE admin_notifications SET order_id = v_new_id WHERE order_id = v_old_id;
  UPDATE referral_coupons SET redeemed_order_id = v_new_id WHERE redeemed_order_id = v_old_id;

  -- pending_keys is a JSONB array of "orderId:lineId" strings (garmentKey() in tailor-worksheet.ts)
  UPDATE tailor_worksheet_snapshots
  SET pending_keys = (
    SELECT COALESCE(jsonb_agg(
      CASE WHEN key LIKE v_old_id || ':%'
           THEN v_new_id || substring(key FROM length(v_old_id) + 1)
           ELSE key END
    ), '[]'::jsonb)
    FROM jsonb_array_elements_text(pending_keys) AS key
  )
  WHERE pending_keys::text LIKE '%' || v_old_id || '%';

  DELETE FROM orders WHERE id = v_old_id;

  RAISE NOTICE 'Renamed order % to %.', v_old_id, v_new_id;
END $$;
