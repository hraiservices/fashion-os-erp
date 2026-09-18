-- Tailor payables used to only appear once an order reached "ready" (snapshot_tailor_payables,
-- called from set_order_stage — see add_tailor_payable_snapshot.sql). The owner wants a tailor's
-- payable amount visible as soon as an order is Received and a tailor is assigned, not just once
-- the garment is finished, so the Tailor Payables report reflects committed work immediately.
--
-- Locked-down design (confirmed with the owner):
--   1. Before an order reaches Ready, and before payroll has confirmed its payable, the
--      payableAmount on every garment with a tailor assigned is LIVE — recalculated from the
--      current tailor rate card on every insert/edit. Change the garment type, reassign the
--      tailor, or edit the rate card, and the number updates; reassigning a garment to a
--      different tailor makes the payable move with it (the old tailor simply no longer has
--      that garment, and therefore no longer shows that payable — "auto-reverse" by construction,
--      no separate ledger needed). Deleting the order removes its garments (and the payable
--      derived from them) along with it, same reasoning.
--   2. The moment an order reaches Ready OR a payroll manager confirms its payables — whichever
--      happens first — that snapshot freezes permanently, exactly like the original design.
--      Confirming early (a manager can now confirm at any stage, not just Ready) is itself the
--      freeze point, so a number a manager has acted on for payroll can never drift afterward.
--
-- recalc_tailor_payables() ALWAYS overwrites payableAmount for a tailor-assigned garment (unlike
-- the original snapshot_tailor_payables(), which only fills a currently-absent value) — that's
-- what makes it "live" rather than "once."
CREATE OR REPLACE FUNCTION recalc_tailor_payables(p_garments JSONB, p_order_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rates  JSONB;
  v_result JSONB;
  v_column TEXT;
BEGIN
  IF p_garments IS NULL THEN
    RETURN p_garments;
  END IF;

  SELECT value INTO v_rates FROM app_settings WHERE key = 'tailorRates';
  v_column := CASE WHEN p_order_type = 'alteration' THEN 'alteration' ELSE 'new' END;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN COALESCE(elem->>'tailor', '') <> '' THEN
        elem || jsonb_build_object(
          'payableAmount',
          COALESCE((v_rates #>> ARRAY[elem->>'type', COALESCE(elem->>'lining', 's'), v_column])::NUMERIC, 0)
            * COALESCE((elem->>'no')::NUMERIC, 1)
        )
      -- No tailor assigned — strip any stale payableAmount rather than leave a number with
      -- nobody attributed to receive it.
      ELSE elem - 'payableAmount'
    END
  ), '[]'::jsonb)
  INTO v_result
  FROM jsonb_array_elements(p_garments) AS elem;

  RETURN v_result;
END;
$$;

-- Runs on every insert (new order) and every update (edit, stage change, ...). Only touches
-- garments while the order is still "open" for recalculation — once ready_at or
-- payables_confirmed_at is set (in this same statement or a previous one), it leaves garments
-- exactly as passed in, which is what makes that the freeze point.
CREATE OR REPLACE FUNCTION trg_recalc_tailor_payables()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ready_at IS NULL AND NEW.payables_confirmed_at IS NULL THEN
    NEW.garments := recalc_tailor_payables(NEW.garments, NEW.order_type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalc_tailor_payables_trigger ON orders;
CREATE TRIGGER recalc_tailor_payables_trigger
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_recalc_tailor_payables();

-- preserve_garment_payables() (add_edit_order_payable_guard.sql) used to ALWAYS carry the old
-- payableAmount forward on every edit, which is exactly wrong now: before the freeze point we
-- want the new trigger above to recompute fresh values from whatever the edit just changed, not
-- have this function re-glue the stale ones back on first. After the freeze point, the original
-- anti-tampering behavior (never trust a client-supplied payableAmount, always keep the frozen
-- one) still applies untouched.
CREATE OR REPLACE FUNCTION preserve_garment_payables(p_new_garments JSONB, p_old_garments JSONB, p_frozen BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_new_garments IS NULL THEN
    RETURN p_new_garments;
  END IF;

  IF NOT p_frozen THEN
    SELECT COALESCE(jsonb_agg(elem - 'payableAmount'), '[]'::jsonb)
    INTO v_result
    FROM jsonb_array_elements(p_new_garments) AS elem;
    RETURN v_result;
  END IF;

  IF p_old_garments IS NULL THEN
    SELECT COALESCE(jsonb_agg(elem - 'payableAmount'), '[]'::jsonb)
    INTO v_result
    FROM jsonb_array_elements(p_new_garments) AS elem;
    RETURN v_result;
  END IF;

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

-- edit_order() now passes whether the order is already frozen (ready_at or
-- payables_confirmed_at set) into preserve_garment_payables, and the recalc trigger above does
-- the actual computation for the not-yet-frozen case — this function's own SET expression just
-- needs to stop re-attaching stale values when it isn't frozen.
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
    garments       = COALESCE(preserve_garment_payables(p_garments, garments, (ready_at IS NOT NULL OR payables_confirmed_at IS NOT NULL)), garments),
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

-- ── Backfill existing orders ──────────────────────────────────────────────────
-- Still-open orders (not yet Ready, not yet confirmed) with a tailor assigned: give them a live
-- payable right now, same as a brand-new order would get from the trigger above.
UPDATE orders
SET garments = recalc_tailor_payables(garments, order_type)
WHERE ready_at IS NULL
  AND payables_confirmed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(garments) elem WHERE COALESCE(elem->>'tailor', '') <> ''
  );

-- Orders already past Ready (including Delivered/Paid) that never got snapshotted at all, or
-- were snapshotted at ₹0 because the rate card had no entry for that garment/lining at the time
-- (the exact warning shown on the Tailor Payables report) — fill in whatever is still missing
-- without touching any payableAmount that's already correctly set, using the original
-- fill-only-if-absent snapshot function so nothing already frozen gets overwritten.
UPDATE orders
SET garments = snapshot_tailor_payables(garments, order_type)
WHERE ready_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(garments) elem
    WHERE COALESCE(elem->>'tailor', '') <> '' AND elem->'payableAmount' IS NULL
  );
