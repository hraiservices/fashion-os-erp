-- Tailor payable snapshot: the moment an order first reaches "ready", each garment that has
-- a tailor assigned gets a payableAmount computed from the tailorRates rate card and frozen
-- into the garments JSONB permanently -- a rate-card change next month must never retroactively
-- change what a tailor was owed for last month's work, same principle as garment.amount
-- already being snapshotted for the customer price at order-creation time.
--
-- snapshot_tailor_payables() does the per-garment jsonb rewrite; set_order_stage() calls it
-- exactly once, guarded by the same "ready_at IS NULL" first-time-only condition already used
-- to stamp ready_at, so a ready -> stitching -> ready round trip never re-snapshots (frozen
-- once set, per the design decision -- edits/reworks after ready do not recalculate payables).

CREATE OR REPLACE FUNCTION snapshot_tailor_payables(p_garments JSONB, p_order_type TEXT)
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
      -- Only garments with a tailor assigned and not already snapshotted get a payable.
      -- elem->'payableAmount' is SQL NULL when the key is absent (every garment today,
      -- and every garment that hasn't been snapshotted yet) -- this is what gates the
      -- "not yet snapshotted" check, not an explicit JSON null.
      WHEN COALESCE(elem->>'tailor', '') <> '' AND elem->'payableAmount' IS NULL THEN
        elem || jsonb_build_object(
          'payableAmount',
          COALESCE((v_rates #>> ARRAY[elem->>'type', COALESCE(elem->>'lining', 's'), v_column])::NUMERIC, 0)
            * COALESCE((elem->>'no')::NUMERIC, 1)
        )
      ELSE elem
    END
  ), '[]'::jsonb)
  INTO v_result
  FROM jsonb_array_elements(p_garments) AS elem;

  RETURN v_result;
END;
$$;

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
    ready_at = CASE WHEN p_new_status = 'ready' AND ready_at IS NULL THEN NOW() ELSE ready_at END,
    garments = CASE
                 WHEN p_new_status = 'ready' AND ready_at IS NULL
                 THEN snapshot_tailor_payables(garments, order_type)
                 ELSE garments
               END
  WHERE id = p_order_id
    AND (p_expected_status IS NULL OR status = p_expected_status)
  RETURNING *;
END;
$$;
