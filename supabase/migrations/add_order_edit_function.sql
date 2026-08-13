-- edit_order: fully atomic order edit — single UPDATE covering all editable fields,
-- with a FOR UPDATE lock that serializes concurrent payment/stage mutations so
-- the history append and financial recalculation cannot race.
--
-- reserve_loyalty_discount: atomically checks and deducts loyalty points before the
-- order INSERT, preventing two concurrent orders from double-spending the same points
-- (C1 race fix). Returns TRUE if deduction succeeded, FALSE if balance was insufficient.

CREATE OR REPLACE FUNCTION edit_order(
  p_order_id      TEXT,
  p_name          TEXT    DEFAULT NULL,
  p_mobile        TEXT    DEFAULT NULL,
  p_in_date       TEXT    DEFAULT NULL,
  p_delivery_date TEXT    DEFAULT NULL,
  p_garments      JSONB   DEFAULT NULL,
  p_total         INTEGER DEFAULT NULL,
  p_advance       INTEGER DEFAULT NULL,
  p_tailor        TEXT    DEFAULT NULL,
  p_special       TEXT    DEFAULT NULL,
  p_measurements  JSONB   DEFAULT NULL,
  p_images        JSONB   DEFAULT NULL,
  p_audios        JSONB   DEFAULT NULL,
  p_videos        JSONB   DEFAULT NULL,
  p_order_type    TEXT    DEFAULT NULL,
  p_history_line  TEXT    DEFAULT NULL
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_total   INTEGER;
  v_advance INTEGER;
BEGIN
  -- Lock the row for the duration of this transaction, preventing concurrent
  -- record_order_payment or set_order_stage calls from racing our UPDATE.
  SELECT total, advance INTO v_total, v_advance
  FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- Resolve financial values: patch wins over current row
  v_total   := COALESCE(p_total,   v_total);
  v_advance := COALESCE(p_advance, v_advance);

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


CREATE OR REPLACE FUNCTION reserve_loyalty_discount(
  p_mobile        TEXT,
  p_pts_to_redeem INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_cust_id TEXT;
  v_balance INTEGER;
BEGIN
  v_cust_id := 'CUST-' || p_mobile;

  -- Row-lock the customer, serializing concurrent redemptions for the same customer
  SELECT loyalty_points INTO v_balance
  FROM customers WHERE id = v_cust_id FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_balance, 0) < p_pts_to_redeem THEN
    -- Balance insufficient or customer not found — concurrent order already spent these points
    RETURN FALSE;
  END IF;

  UPDATE customers
  SET loyalty_points = loyalty_points - p_pts_to_redeem
  WHERE id = v_cust_id;

  RETURN TRUE;
END;
$$;
