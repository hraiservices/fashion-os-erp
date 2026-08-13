-- edit_order: fully atomic order edit — single UPDATE covering all editable fields,
-- with a FOR UPDATE lock that serializes concurrent payment/stage mutations so
-- the history append and financial recalculation cannot race.
--
-- reserve_loyalty_discount / refund_loyalty_discount: atomic point reservation for the
-- order-creation redemption path, with a compensating refund used when the order INSERT
-- fails after points were already deducted.

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
  -- Optimistic concurrency: when the caller intends to change `advance`, it passes the
  -- advance value it last saw. If the stored advance has moved on (a payment landed while
  -- the edit form was open) we abort instead of silently overwriting the payment.
  p_expected_advance INTEGER DEFAULT NULL
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

  IF p_expected_advance IS NOT NULL AND v_advance IS DISTINCT FROM p_expected_advance THEN
    RAISE EXCEPTION 'STALE_ADVANCE: a payment was recorded while you were editing (advance is now ₹%, you saw ₹%). Reload and try again.', v_advance, p_expected_advance;
  END IF;

  -- Resolve financial values: patch wins over current row
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


-- Deducts points and records the redemption in loyalty_history in one locked statement.
-- Returns TRUE if the deduction happened, FALSE if the balance was insufficient (a
-- concurrent order already spent those points).
CREATE OR REPLACE FUNCTION reserve_loyalty_discount(
  p_mobile        TEXT,
  p_pts_to_redeem INTEGER,
  p_order_id      TEXT DEFAULT NULL,
  p_note          TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_cust_id TEXT;
  v_balance INTEGER;
  v_hist    JSONB;
BEGIN
  -- Guard: a negative value here would ADD points (loyalty_points - (-N)). Without this
  -- check any caller able to reach the RPC could mint themselves unlimited points.
  IF p_pts_to_redeem IS NULL OR p_pts_to_redeem <= 0 THEN
    RETURN FALSE;
  END IF;
  IF p_mobile IS NULL OR p_mobile = '' THEN
    RETURN FALSE;
  END IF;

  v_cust_id := 'CUST-' || p_mobile;

  -- Row-lock the customer, serializing concurrent redemptions for the same customer
  SELECT loyalty_points, COALESCE(loyalty_history, '[]'::jsonb)
    INTO v_balance, v_hist
  FROM customers WHERE id = v_cust_id FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_balance, 0) < p_pts_to_redeem THEN
    RETURN FALSE;
  END IF;

  -- Record the redemption in loyalty_history so the customer's point ledger stays
  -- auditable (mirrors what award_loyalty_points writes for every other point movement).
  v_hist := jsonb_build_array(
    jsonb_build_object(
      'date',    to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'type',    'redeem',
      'pts',     -p_pts_to_redeem,
      'orderId', p_order_id,
      'note',    COALESCE(p_note, '')
    )
  ) || v_hist;

  IF jsonb_array_length(v_hist) > 50 THEN
    SELECT jsonb_agg(elem) INTO v_hist
    FROM (
      SELECT elem FROM jsonb_array_elements(v_hist) WITH ORDINALITY AS t(elem, i)
      WHERE i <= 50
    ) capped;
  END IF;

  UPDATE customers
  SET loyalty_points  = loyalty_points - p_pts_to_redeem,
      loyalty_history = v_hist,
      updated_at      = now()
  WHERE id = v_cust_id;

  RETURN TRUE;
END;
$$;


-- Compensating transaction: returns reserved points when the order INSERT that they were
-- reserved for fails. Without this, a failed insert silently burns the customer's points.
CREATE OR REPLACE FUNCTION refund_loyalty_discount(
  p_mobile   TEXT,
  p_pts      INTEGER,
  p_order_id TEXT DEFAULT NULL,
  p_note     TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_cust_id TEXT;
  v_hist    JSONB;
BEGIN
  IF p_pts IS NULL OR p_pts <= 0 OR p_mobile IS NULL OR p_mobile = '' THEN
    RETURN FALSE;
  END IF;

  v_cust_id := 'CUST-' || p_mobile;

  SELECT COALESCE(loyalty_history, '[]'::jsonb) INTO v_hist
  FROM customers WHERE id = v_cust_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_hist := jsonb_build_array(
    jsonb_build_object(
      'date',    to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'type',    'redeem_reversal',
      'pts',     p_pts,
      'orderId', p_order_id,
      'note',    COALESCE(p_note, '')
    )
  ) || v_hist;

  IF jsonb_array_length(v_hist) > 50 THEN
    SELECT jsonb_agg(elem) INTO v_hist
    FROM (
      SELECT elem FROM jsonb_array_elements(v_hist) WITH ORDINALITY AS t(elem, i)
      WHERE i <= 50
    ) capped;
  END IF;

  -- Reversal restores the spendable balance but must NOT inflate total_points_earned.
  UPDATE customers
  SET loyalty_points  = loyalty_points + p_pts,
      loyalty_history = v_hist,
      updated_at      = now()
  WHERE id = v_cust_id;

  RETURN TRUE;
END;
$$;
