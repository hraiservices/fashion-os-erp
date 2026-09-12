-- The owner does not want a garment's tailor payable to freeze automatically the moment its
-- order reaches "Ready" — piece-rate tailors have no salary/payroll cycle, so there's no reason
-- a payable should stop tracking the rate card just because the garment is finished. It should
-- stay live, recalculating on every edit, from the moment the order is Received all the way
-- through Ready, and freeze ONLY when a manager explicitly clicks "Confirm tailor payables" on
-- the order (payables_confirmed_at) — that click is now the single freeze point instead of
-- "Ready OR Confirm, whichever comes first".
--
-- This also fixes the concrete symptom that triggered this: a Ready order (SOR-2026-0191, not
-- yet confirmed) kept showing the old ₹300 tailor rate for "Salwar Suit" after the rate was
-- raised to ₹350, because it had already frozen at Ready before the rate change. Removing the
-- Ready freeze, plus the one-time re-snapshot below, corrects it (and every other
-- Ready-but-not-confirmed order) immediately.

-- 1. The live-recalc trigger now only stops touching a garment once payables_confirmed_at is
--    set — reaching Ready no longer freezes anything by itself.
CREATE OR REPLACE FUNCTION trg_recalc_tailor_payables()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payables_confirmed_at IS NULL THEN
    NEW.garments := recalc_tailor_payables(NEW.garments, NEW.order_type);
  END IF;
  RETURN NEW;
END;
$$;

-- 2. edit_order()'s "is this order frozen" flag (which governs whether a manual edit's
--    payableAmount gets recomputed or preserved as-is) drops the ready_at half of the check too,
--    for the same reason. Matches the latest edit_order() signature/body from
--    fix_edit_order_overload_ambiguity.sql, with only this one condition changed.
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
    RAISE EXCEPTION 'STALE_ADVANCE: a payment was recorded while you were editing (advance is now ₹%, you saw ₹%). Reload and try again.', v_advance, p_expected_advance;
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
    garments       = COALESCE(preserve_garment_payables(p_garments, garments, payables_confirmed_at IS NOT NULL), garments),
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

-- 3. Retroactive fix: every order that already reached Ready but hasn't been confirmed yet was
--    frozen under the old rule even though it shouldn't have been — re-snapshot ALL of them
--    (every garment type, not just the one that was just edited) to whatever the rate card says
--    right now. Uses recalc_tailor_payables (overwrites unconditionally), not
--    snapshot_tailor_payables (fills-if-absent only), since these values need correcting, not
--    just filling in.
UPDATE orders
SET garments = recalc_tailor_payables(garments, order_type)
WHERE ready_at IS NOT NULL
  AND payables_confirmed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(garments) elem WHERE COALESCE(elem->>'tailor', '') <> ''
  );
