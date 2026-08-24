-- edit_order's p_garments is a full-array replace (garments = COALESCE(p_garments, garments)).
-- Once garments can carry a snapshotted, frozen payableAmount (see
-- add_tailor_payable_snapshot.sql), a client editing an order could otherwise forge or inflate
-- that figure through a normal order edit -- p_garments is ordinary request input, not
-- server-computed. preserve_garment_payables() strips any client-supplied payableAmount and
-- re-attaches whatever the row already had for that garment position instead, so the only way
-- payableAmount is ever set is snapshot_tailor_payables() inside set_order_stage(), never a
-- client-supplied edit. Matches the "frozen once snapshotted, never recalculated" design.

CREATE OR REPLACE FUNCTION preserve_garment_payables(p_new_garments JSONB, p_old_garments JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_new_garments IS NULL THEN
    RETURN p_new_garments;
  END IF;

  IF p_old_garments IS NULL THEN
    SELECT COALESCE(jsonb_agg(elem - 'payableAmount'), '[]'::jsonb)
    INTO v_result
    FROM jsonb_array_elements(p_new_garments) AS elem;
    RETURN v_result;
  END IF;

  -- Match by array position (garment rows keep their order across an edit; new rows appended
  -- at the end simply have no old counterpart and get their payableAmount stripped).
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN old_elem IS NOT NULL AND old_elem ? 'payableAmount'
      THEN new_elem || jsonb_build_object('payableAmount', old_elem -> 'payableAmount')
      ELSE new_elem - 'payableAmount'
    END
    ORDER BY idx
  ), '[]'::jsonb)
  INTO v_result
  FROM jsonb_array_elements(p_new_garments) WITH ORDINALITY AS n(new_elem, idx)
  LEFT JOIN jsonb_array_elements(p_old_garments) WITH ORDINALITY AS o(old_elem, idx2) ON idx = idx2;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION edit_order(
  p_order_id        TEXT,
  p_name            TEXT    DEFAULT NULL,
  p_mobile          TEXT    DEFAULT NULL,
  p_in_date         TEXT    DEFAULT NULL,
  p_delivery_date   TEXT    DEFAULT NULL,
  p_garments        JSONB   DEFAULT NULL,
  p_total           INTEGER DEFAULT NULL,
  p_advance         INTEGER DEFAULT NULL,
  p_tailor          TEXT    DEFAULT NULL,
  p_special         TEXT    DEFAULT NULL,
  p_measurements    JSONB   DEFAULT NULL,
  p_images          JSONB   DEFAULT NULL,
  p_audios          JSONB   DEFAULT NULL,
  p_videos          JSONB   DEFAULT NULL,
  p_order_type      TEXT    DEFAULT NULL,
  p_history_line    TEXT    DEFAULT NULL,
  p_expected_advance INTEGER DEFAULT NULL,
  p_in_time         TEXT    DEFAULT NULL,
  p_delivery_time   TEXT    DEFAULT NULL,
  p_booking_source  TEXT    DEFAULT NULL,
  p_fabric_cost     NUMERIC DEFAULT NULL,
  p_other_cost      NUMERIC DEFAULT NULL
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_total   INTEGER;
  v_advance INTEGER;
BEGIN
  SELECT total, advance INTO v_total, v_advance
  FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF p_expected_advance IS NOT NULL AND v_advance IS DISTINCT FROM p_expected_advance THEN
    RAISE EXCEPTION 'STALE_ADVANCE: a payment was recorded while you were editing (advance is now ₹%, you saw ₹%). Reload and try again.', v_advance, p_expected_advance;
  END IF;

  v_total   := COALESCE(p_total,   v_total);
  v_advance := COALESCE(p_advance, v_advance);

  IF v_total < 0 OR v_advance < 0 THEN
    RAISE EXCEPTION 'Total and advance cannot be negative (total=%, advance=%)', v_total, v_advance;
  END IF;

  IF v_advance > v_total THEN
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
    garments       = COALESCE(preserve_garment_payables(p_garments, garments), garments),
    total          = v_total,
    advance        = v_advance,
    balance        = GREATEST(0, v_total - v_advance),
    tailor         = COALESCE(p_tailor,         tailor),
    special        = COALESCE(p_special,        special),
    measurements   = COALESCE(p_measurements,   measurements),
    images         = COALESCE(p_images,         images),
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
