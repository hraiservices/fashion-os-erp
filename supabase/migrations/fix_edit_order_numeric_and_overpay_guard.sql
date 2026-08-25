-- Two bugs that made real, pre-existing orders permanently uneditable.
--
-- 1) p_total / p_advance / p_expected_advance were INTEGER while orders.total / orders.advance
--    are NUMERIC. Any order carrying a fractional rupee value (a rate card with paise, a
--    part-payment that divided unevenly) failed two different ways: PostgREST rejected the call
--    outright with "invalid input syntax for type integer", and — worse — a stored advance of
--    e.g. 500.50 was rounded to 500 on read, so the optimistic-lock comparison against the
--    client's real 500.50 ALWAYS mismatched and raised a spurious STALE_ADVANCE ("a payment was
--    recorded while you were editing") that no amount of reloading could clear.
--
-- 2) The advance > total guard rejected every edit to an already-overpaid order. Because the
--    edit form resubmits the order's own stored total/advance untouched on every save, such an
--    order could never be edited again for ANY reason — not even to fix a spelling mistake.
--    These orders demonstrably exist (supabase/PRE_LIVE_VERIFY.sql has a query for them). The
--    guard now only fires when this edit actually creates or worsens the overpayment, matching
--    the same relaxation in src/app/api/orders/[id]/route.ts.
--
-- The INTEGER-signature function must be DROPped, not just replaced: changing a parameter type
-- creates a NEW overload rather than replacing the old one, and leaving both would make
-- PostgREST's function resolution ambiguous.
DROP FUNCTION IF EXISTS edit_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, TEXT, TEXT,
  JSONB, JSONB, JSONB, JSONB, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, NUMERIC, NUMERIC
);

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
  v_total       NUMERIC;
  v_advance     NUMERIC;
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

  -- Only block an overpayment this edit actually introduces or deepens. A pre-existing one is
  -- left alone so the order stays editable (see note 2 in the header).
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
