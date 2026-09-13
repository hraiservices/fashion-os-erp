-- Business change: most garment types are now priced variably per order (fabric/design/
-- negotiation), so a flat per-garment-type rate can no longer drive what the tailor is paid —
-- it has to be a plain figure entered on the order itself, exactly like the customer-facing
-- Rate field already is (pre-filled from a rate card as a starting suggestion, then freely
-- editable). This retires the entire server-side auto-recalculation/freeze machinery that made
-- payableAmount a computed, non-editable value:
--
--   - trg_recalc_tailor_payables() / recalc_tailor_payables() — the trigger that force-
--     overwrote every tailor-assigned garment's payableAmount from the rate card on every
--     order write. There is no rate-card-driven recomputation anymore; whatever a
--     sales/manager/admin user enters on the garment line (via the order form's new Tailor
--     Payable field) is stored as-is, same as `amount`.
--   - preserve_garment_payables() — existed only to protect a frozen payableAmount across an
--     edit under the old model. With no more freezing-from-a-rate-card, edit_order() simply
--     stores whatever garments array it's given, exactly like every other field.
--   - snapshot_tailor_payables() and its call from set_order_stage() — same reasoning; a
--     garment reaching "ready" no longer triggers any rate-card lookup.
--
-- The Tailor Payable Rate card (tailor_rate_versions / current_tailor_rates()) is untouched —
-- it's still read client-side by the order form as the default suggestion for that field, just
-- no longer enforced or recomputed server-side.
--
-- Existing orders are NOT touched — every already-stored payableAmount (however it got there)
-- is left exactly as-is. The owner is deliberately reconciling specific orders by hand against
-- physical receipts, not all of them, so nothing here may reset or recompute any existing value.

DROP TRIGGER IF EXISTS recalc_tailor_payables_trigger ON orders;
DROP FUNCTION IF EXISTS trg_recalc_tailor_payables();
DROP FUNCTION IF EXISTS recalc_tailor_payables(JSONB, TEXT);
DROP FUNCTION IF EXISTS snapshot_tailor_payables(JSONB, TEXT);
DROP FUNCTION IF EXISTS preserve_garment_payables(JSONB, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS preserve_garment_payables(JSONB, JSONB);

-- edit_order() simplifies to a plain COALESCE like every other field — the API route is what
-- now decides (for the tailor role only) whether a submitted garments array's payableAmount is
-- trusted or overwritten with the prior stored value, before this function ever sees it.
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
    garments       = COALESCE(p_garments,       garments),
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

-- set_order_stage() drops its garments touch entirely — nothing to snapshot anymore.
CREATE OR REPLACE FUNCTION set_order_stage(
  p_order_id        TEXT,
  p_new_status      TEXT,
  p_history_line    TEXT,
  p_expected_status TEXT DEFAULT NULL
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_new_status NOT IN ('received','cutting','stitching','ready','delivered','payment') THEN
    RAISE EXCEPTION 'Invalid stage: %', p_new_status;
  END IF;

  RETURN QUERY
  UPDATE orders
  SET
    status   = p_new_status,
    history  = history || to_jsonb(p_history_line),
    ready_at = CASE WHEN p_new_status = 'ready' AND ready_at IS NULL THEN NOW() ELSE ready_at END
  WHERE id = p_order_id
    AND (p_expected_status IS NULL OR status = p_expected_status)
  RETURNING *;
END;
$$;
