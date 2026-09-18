-- Run this once in your Supabase SQL editor.
--
-- rename_slash_order_id.sql fixed ONE specific order (SOR/2026/0191) whose id still contained
-- a slash from before the Document Numbering default separator was changed to "-". That was a
-- one-off patch, not a fix for the underlying data — every order created before that change with
-- the separator still set to "/" has the same broken id, and each one 404s its own detail page
-- and throws a raw JSON-parse error ("The string did not match the expected pattern." on
-- Safari/iOS) when deleted, because /api/orders/<id-with-slashes> no longer matches the
-- single-segment [id] route. This migration generalizes that fix to every affected order, not
-- just the one that had already been reported.
--
-- Same clone-repoint-delete approach as the one-off version, looped over every order whose id
-- still contains a "/": insert a copy under the slash-free id (exact column-for-column copy via
-- jsonb, so it can't drift from the real schema), repoint every table that stores this order's id
-- by value, then delete the old row — all in one transaction per order, so each rename either
-- fully lands or fully doesn't.
DO $$
DECLARE
  v_old_id TEXT;
  v_new_id TEXT;
  v_row JSONB;
  v_suffix INT;
BEGIN
  FOR v_old_id IN SELECT id FROM orders WHERE id LIKE '%/%' LOOP
    v_new_id := replace(v_old_id, '/', '-');
    v_suffix := 1;
    -- Extremely unlikely, but guard against the slash-free version already existing (e.g. a
    -- collision with an order created after the separator fix) rather than clobbering it.
    WHILE EXISTS (SELECT 1 FROM orders WHERE id = v_new_id) LOOP
      v_suffix := v_suffix + 1;
      v_new_id := replace(v_old_id, '/', '-') || '-dup' || v_suffix;
    END LOOP;

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
  END LOOP;
END $$;
