-- "Could not choose the best candidate function between: public.edit_order(...) and
-- public.edit_order(...)" on every single order edit — add_early_tailor_payables.sql
-- (2026-09-09) redeclared edit_order() with p_total/p_advance/p_expected_advance as INTEGER,
-- copied from an older template without noticing fix_edit_order_numeric_and_overpay_guard.sql
-- (2026-08-25) and fix_edit_order_images_array_type.sql (2026-08-31) had already fixed those
-- three params to NUMERIC. CREATE OR REPLACE FUNCTION only replaces a function with an
-- IDENTICAL argument-type signature — a different type on even one parameter creates a second,
-- separate overload instead. So the database has carried two edit_order() overloads ever
-- since, differing only in those three params' types, and PostgREST/Postgres can no longer
-- pick one deterministically for an ordinary call.
--
-- That same copy-paste regressed two other already-shipped fixes along with the numeric types:
--   1. images was cast back to a plain `COALESCE(p_images, images)` against a JSONB param, which
--      fails outright against the real `text[]` images column ("COALESCE types jsonb and
--      text[] cannot be matched") — see fix_edit_order_images_array_type.sql's own comment.
--   2. The overpay guard went back to unconditionally rejecting advance > total, instead of
--      only blocking an overpayment this specific edit introduces or deepens (pre-existing
--      overpaid orders must stay editable) — see fix_edit_order_numeric_and_overpay_guard.sql.
--
-- Fix: drop the stray INTEGER-typed overload outright, then recreate edit_order() once, with
-- NUMERIC types, the text[] image cast, and the nuanced overpay guard restored — plus the
-- frozen-garments payable preservation (preserve_garment_payables's 3-arg form) that
-- add_early_tailor_payables.sql actually needed to add, which this migration keeps.
DROP FUNCTION IF EXISTS edit_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB,
  TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, NUMERIC, NUMERIC
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

  -- Only block an overpayment this edit actually introduces or deepens. A pre-existing one is
  -- left alone so the order stays editable.
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
    garments       = COALESCE(preserve_garment_payables(p_garments, garments, (ready_at IS NOT NULL OR payables_confirmed_at IS NOT NULL)), garments),
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
