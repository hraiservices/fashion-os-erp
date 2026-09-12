-- The owner does not want a manager-confirmation step for tailor payables at all: tailors are
-- piece-rate, not salaried, and the shop pays them for work assigned regardless of whether the
-- customer has paid yet. A garment/work-order payable should be "active" — live, tracked, and
-- eligible for payroll — the moment an order is Received and a tailor is assigned, with no
-- separate manual (or automatic-on-Ready) confirmation click anywhere in the workflow. The only
-- remaining freeze point is piece_rate_paid_at — the moment a payroll run actually pays it out.
--
-- This removes the whole payables_confirmed_at / labor_payable_confirmed_at mechanism from the
-- live-recalc and edit-preservation logic (the app layer no longer calls confirm_order_payables/
-- confirm_wo_payable at all — those routes and UI buttons are removed in this same change), and
-- re-lives every currently-unpaid order's garments so anything that had frozen under the old
-- "confirmed" rule starts tracking the current rate card again immediately.

-- 1. The live-recalc trigger now only stops touching a garment once piece_rate_paid_at is set —
--    the single remaining freeze point, matching payroll actually having paid it out.
CREATE OR REPLACE FUNCTION trg_recalc_tailor_payables()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.piece_rate_paid_at IS NULL THEN
    NEW.garments := recalc_tailor_payables(NEW.garments, NEW.order_type);
  END IF;
  RETURN NEW;
END;
$$;

-- 2. edit_order()'s "is this order frozen" flag drops the payables_confirmed_at check too, for
--    the same reason. Matches the latest edit_order() signature/body from
--    unfreeze_tailor_payables_at_ready.sql, with only this one condition changed.
CREATE OR REPLACE FUNCTION edit_order(
  p_order_id        TEXT,
  p_name            TEXT    DEFAULT NULL,
  p_mobile          TEXT    DEFAULT NULL,
  p_in_date         TEXT    DEFAULT NULL,
  p_delivery_date   TEXT    DEFAULT NULL,
  p_garments        JSONB   DEFAULT NULL,
  p_total           NUMERIC DEFAULT NULL,
  p_advance         NUMERIC DEFAULT NULL,
  p_tailor          TEXT    DEFAULT NULL,
  p_special         TEXT    DEFAULT NULL,
  p_measurements    JSONB   DEFAULT NULL,
  p_images          JSONB   DEFAULT NULL,
  p_audios          JSONB   DEFAULT NULL,
  p_videos          JSONB   DEFAULT NULL,
  p_order_type      TEXT    DEFAULT NULL,
  p_history_line    TEXT    DEFAULT NULL,
  p_expected_advance NUMERIC DEFAULT NULL,
  p_in_time         TEXT    DEFAULT NULL,
  p_delivery_time   TEXT    DEFAULT NULL,
  p_booking_source  TEXT    DEFAULT NULL,
  p_fabric_cost     NUMERIC DEFAULT NULL,
  p_other_cost      NUMERIC DEFAULT NULL
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_total        NUMERIC;
  v_advance      NUMERIC;
  v_orig_total   NUMERIC;
  v_orig_advance NUMERIC;
BEGIN
  SELECT total, advance INTO v_total, v_advance
  FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_orig_total   := v_total;
  v_orig_advance := v_advance;

  IF p_expected_advance IS NOT NULL AND v_advance IS DISTINCT FROM p_expected_advance THEN
    RAISE EXCEPTION 'STALE_ADVANCE: a payment was already recorded for this order (advance is now ₹%, you saw ₹%). Reload and try again.', v_advance, p_expected_advance;
  END IF;

  v_total   := COALESCE(p_total,   v_total);
  v_advance := COALESCE(p_advance, v_advance);

  IF v_total < 0 OR v_advance < 0 THEN
    RAISE EXCEPTION 'Total and advance cannot be negative (total=%, advance=%)', v_total, v_advance;
  END IF;

  IF v_advance > v_total
     AND (v_orig_advance <= v_orig_total OR v_advance > v_orig_advance OR v_total < v_orig_total) THEN
    RAISE EXCEPTION 'Advance (₹%) cannot exceed total (₹%)', v_advance, v_total;
  END IF;

  IF p_order_type IS NOT NULL AND p_order_type NOT IN ('new', 'alteration') THEN
    RAISE EXCEPTION 'Invalid order_type: %', p_order_type;
  END IF;

  RETURN QUERY
  UPDATE orders SET
    name           = COALESCE(p_name,           name),
    mobile         = COALESCE(p_mobile,         mobile),
    in_date        = COALESCE(p_in_date,        in_date),
    delivery_date  = COALESCE(p_delivery_date,  delivery_date),
    in_time        = COALESCE(p_in_time,        in_time),
    delivery_time  = COALESCE(p_delivery_time,  delivery_time),
    garments       = COALESCE(preserve_garment_payables(p_garments, garments, piece_rate_paid_at IS NOT NULL), garments),
    total          = v_total,
    advance        = v_advance,
    balance        = GREATEST(0, v_total - v_advance),
    tailor         = COALESCE(p_tailor,         tailor),
    special        = COALESCE(p_special,        special),
    measurements   = COALESCE(p_measurements,   measurements),
    images         = CASE WHEN p_images IS NULL THEN images ELSE ARRAY(SELECT jsonb_array_elements_text(p_images)) END,
    audios         = COALESCE(p_audios,         audios),
    videos         = COALESCE(p_videos,         videos),
    order_type     = COALESCE(p_order_type,     order_type),
    booking_source = COALESCE(p_booking_source, booking_source),
    fabric_cost    = COALESCE(p_fabric_cost,    fabric_cost),
    other_cost     = COALESCE(p_other_cost,     other_cost),
    history        = CASE
                       WHEN p_history_line IS NOT NULL
                       THEN history || to_jsonb(p_history_line)
                       ELSE history
                     END
  WHERE id = p_order_id
  RETURNING *;
END;
$$;

-- 3. Remove the now-dead confirm machinery entirely — no code path calls these RPCs anymore
--    (the confirm-payables/confirm-payable API routes and their UI buttons are removed in this
--    same change). Fewer SECURITY DEFINER functions with elevated grants lying around unused is
--    its own small security win, on top of just being dead code.
DROP TRIGGER IF EXISTS trg_guard_orders_payable_confirm ON orders;
DROP TRIGGER IF EXISTS trg_guard_wo_payable_confirm ON work_orders;
DROP FUNCTION IF EXISTS guard_payables_confirm();
DROP FUNCTION IF EXISTS confirm_order_payables(TEXT, TEXT);
DROP FUNCTION IF EXISTS confirm_wo_payable(TEXT, TEXT);

-- payables_confirmed_at/by and labor_payable_confirmed_at/by columns are left in place
-- (historical record of what used to be confirmed under the old workflow) — nothing reads them
-- anymore, and dropping columns is not reversible, so they're simply retired rather than removed.

-- 4. Retroactive fix: every order not yet paid out by payroll (piece_rate_paid_at IS NULL) that
--    had frozen under the old "confirmed" rule starts tracking the current rate card again,
--    immediately — no re-save needed.
UPDATE orders
SET garments = recalc_tailor_payables(garments, order_type)
WHERE piece_rate_paid_at IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(garments) elem WHERE COALESCE(elem->>'tailor', '') <> ''
  );
