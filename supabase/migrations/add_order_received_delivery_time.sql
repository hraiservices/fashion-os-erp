-- Adds order-received and delivery TIME alongside the existing date-only in_date/delivery_date
-- TEXT columns. Additive by design: in_date/delivery_date keep their current TEXT date-only
-- format and every existing reader (chatbot NL-query view, reports, exports, analytics,
-- order-import wizard) is untouched. Both new columns are nullable "HH:mm" strings — a blank
-- time means "unknown / not captured", and callers should fall back to end-of-day the same
-- way the countdown widget already treats a bare date.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS in_time       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_time TEXT;

COMMENT ON COLUMN orders.in_time IS 'Order-received time, "HH:mm" 24h local time. Null/blank = not captured (legacy rows, or date-only entry).';
COMMENT ON COLUMN orders.delivery_time IS 'Promised delivery time, "HH:mm" 24h local time. Null/blank = end-of-day (matches prior countdown behavior).';

-- edit_order(): add p_in_time / p_delivery_time alongside the existing date params.
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
  p_delivery_time   TEXT    DEFAULT NULL
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
    name          = COALESCE(p_name,          name),
    mobile        = COALESCE(p_mobile,        mobile),
    in_date       = COALESCE(p_in_date,       in_date),
    delivery_date = COALESCE(p_delivery_date, delivery_date),
    in_time       = COALESCE(p_in_time,       in_time),
    delivery_time = COALESCE(p_delivery_time, delivery_time),
    garments      = COALESCE(p_garments,      garments),
    total         = v_total,
    advance       = v_advance,
    balance       = GREATEST(0, v_total - v_advance),
    tailor        = COALESCE(p_tailor,        tailor),
    special       = COALESCE(p_special,       special),
    measurements  = COALESCE(p_measurements,  measurements),
    images        = COALESCE(p_images,        images),
    audios        = COALESCE(p_audios,        audios),
    videos        = COALESCE(p_videos,        videos),
    order_type    = COALESCE(p_order_type,    order_type),
    history       = CASE
                      WHEN p_history_line IS NOT NULL
                      THEN history || to_jsonb(p_history_line)
                      ELSE history
                    END
  WHERE id = p_order_id
  RETURNING *;
END;
$$;
