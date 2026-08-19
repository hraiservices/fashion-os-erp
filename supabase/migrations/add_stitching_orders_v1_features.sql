-- Stitching Orders "Feature Backlog v1" — booking source, cost/profitability fields,
-- rework flag, ready_at timestamp for aging reports. Run once in Supabase SQL editor.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fabric_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS other_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rework_flag BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rework_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rework_flagged_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rework_flagged_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

-- Stamps ready_at the moment an order first reaches 'ready' — powers the
-- ready-but-uncollected-aging report. Identical to add_atomic_stage_history.sql's
-- set_order_stage otherwise; CREATE OR REPLACE keeps both call sites (set-stage and
-- advance-stage routes) covered automatically since they share this one function.
CREATE OR REPLACE FUNCTION set_order_stage(
  p_order_id       TEXT,
  p_new_status     TEXT,
  p_history_line   TEXT,
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

-- Toggle the rework flag — a separate small RPC so it's atomic and independently
-- permissioned from edit_order (rework should be settable by anyone with changeStage,
-- e.g. a tailor noticing a defect, not just editOrder-holders).
CREATE OR REPLACE FUNCTION set_order_rework(
  p_order_id     TEXT,
  p_flag         BOOLEAN,
  p_reason       TEXT,
  p_user         TEXT,
  p_history_line TEXT
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE orders
  SET
    rework_flag       = p_flag,
    rework_reason      = CASE WHEN p_flag THEN p_reason ELSE '' END,
    rework_flagged_by  = CASE WHEN p_flag THEN p_user ELSE NULL END,
    rework_flagged_at  = CASE WHEN p_flag THEN NOW() ELSE NULL END,
    history             = history || to_jsonb(p_history_line)
  WHERE id = p_order_id
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION set_order_rework(TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated;

-- edit_order(): add p_booking_source / p_fabric_cost / p_other_cost alongside the existing
-- params (see add_order_received_delivery_time.sql for the prior signature this extends).
-- Identical body otherwise — COALESCE means omitting a param leaves that column untouched,
-- same convention as every other field here.
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
    garments       = COALESCE(p_garments,       garments),
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
