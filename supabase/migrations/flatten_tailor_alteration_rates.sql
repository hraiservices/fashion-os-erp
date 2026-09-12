-- Collapses the tailor payable rate card's alteration payout from "one value per lining"
-- (garment_type -> {s: {new, alteration}, h: {new, alteration}, f: {new, alteration}}) down to
-- one value per garment type (garment_type -> {s, h, f, alteration}) — an alteration is priced
-- by the work done, not by how the original garment was lined, so 3 separate alteration numbers
-- per garment type was never meaningful, just confusing. This makes the tailor payable shape
-- identical to the customer-facing rate card's shape (see DEFAULT_RATES/GarmentRate in
-- src/lib/business-rules.ts), which also gains a single alteration price per garment type here.
--
-- Existing data reconciliation: every tailor_rate_versions row (current AND historical, so
-- payroll references stay consistent) has its 3 old alteration values collapsed into 1, seeded
-- from the "No Lining" (s) alteration rate — an explicit choice, reviewable/adjustable afterward
-- on the merged Rate Card page.

-- 1. Tailor payable rate card — every version, current and historical.
UPDATE tailor_rate_versions
SET rates = (
  SELECT COALESCE(
    jsonb_object_agg(
      key,
      jsonb_build_object(
        's', COALESCE((value #>> '{s,new}')::numeric, 0),
        'h', COALESCE((value #>> '{h,new}')::numeric, 0),
        'f', COALESCE((value #>> '{f,new}')::numeric, 0),
        'alteration', COALESCE((value #>> '{s,alteration}')::numeric, 0)
      )
    ),
    '{}'::jsonb
  )
  FROM jsonb_each(rates) AS kv(key, value)
)
WHERE rates IS NOT NULL
  AND EXISTS (SELECT 1 FROM jsonb_each(rates) AS e(key, value) WHERE jsonb_typeof(value -> 's') = 'object');

-- 2. Legacy flat app_settings.tailorRates mirror key (set_tailor_rates_versioned keeps this in
--    sync with current_tailor_rates() on every write; reshape it too so it isn't briefly stale
--    for any not-yet-migrated reader until the next rate change).
UPDATE app_settings
SET value = (
  SELECT COALESCE(
    jsonb_object_agg(
      key,
      jsonb_build_object(
        's', COALESCE((value #>> '{s,new}')::numeric, 0),
        'h', COALESCE((value #>> '{h,new}')::numeric, 0),
        'f', COALESCE((value #>> '{f,new}')::numeric, 0),
        'alteration', COALESCE((value #>> '{s,alteration}')::numeric, 0)
      )
    ),
    '{}'::jsonb
  )
  FROM jsonb_each(value) AS kv(key, value)
)
WHERE key = 'tailorRates'
  AND value IS NOT NULL
  AND EXISTS (SELECT 1 FROM jsonb_each(value) AS e(key, value) WHERE jsonb_typeof(value -> 's') = 'object');

-- 3. Customer-facing rate card gains the same alteration field per garment type, defaulting to 0
--    (or whatever it already had, if this runs more than once) — no lining split for alterations
--    here either, matching the tailor side.
UPDATE app_settings
SET value = (
  SELECT COALESCE(
    jsonb_object_agg(key, value || jsonb_build_object('alteration', COALESCE((value ->> 'alteration')::numeric, 0))),
    '{}'::jsonb
  )
  FROM jsonb_each(value) AS kv(key, value)
)
WHERE key = 'rates' AND value IS NOT NULL;

-- 4. Live payable recalculation now reads the flattened shape: a NEW-stitching garment looks up
--    garment_type -> lining directly (no more "-> new"); an ALTERATION garment looks up
--    garment_type -> alteration, ignoring the garment's own lining entirely. Same control flow
--    as before (recalc runs on every write to a not-yet-frozen order; snapshot runs once, the
--    first time an order reaches "ready"), only the JSON path construction changes.
CREATE OR REPLACE FUNCTION recalc_tailor_payables(p_garments JSONB, p_order_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rates         JSONB;
  v_result        JSONB;
  v_is_alteration BOOLEAN;
BEGIN
  IF p_garments IS NULL THEN
    RETURN p_garments;
  END IF;

  v_rates := current_tailor_rates();
  v_is_alteration := (p_order_type = 'alteration');

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN COALESCE(elem->>'tailor', '') <> '' THEN
        elem || jsonb_build_object(
          'payableAmount',
          COALESCE(
            (v_rates #>> ARRAY[elem->>'type', CASE WHEN v_is_alteration THEN 'alteration' ELSE COALESCE(elem->>'lining', 's') END])::NUMERIC,
            0
          ) * COALESCE((elem->>'no')::NUMERIC, 1)
        )
      ELSE elem - 'payableAmount'
    END
  ), '[]'::jsonb)
  INTO v_result
  FROM jsonb_array_elements(p_garments) AS elem;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot_tailor_payables(p_garments JSONB, p_order_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rates         JSONB;
  v_result        JSONB;
  v_is_alteration BOOLEAN;
  v_path          TEXT[];
BEGIN
  IF p_garments IS NULL THEN
    RETURN p_garments;
  END IF;

  v_rates := current_tailor_rates();
  v_is_alteration := (p_order_type = 'alteration');

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN COALESCE(elem->>'tailor', '') <> '' AND elem->'payableAmount' IS NULL THEN
        CASE
          WHEN (v_rates #>> ARRAY[elem->>'type', CASE WHEN v_is_alteration THEN 'alteration' ELSE COALESCE(elem->>'lining', 's') END]) IS NOT NULL THEN
            elem || jsonb_build_object(
              'payableAmount',
              (v_rates #>> ARRAY[elem->>'type', CASE WHEN v_is_alteration THEN 'alteration' ELSE COALESCE(elem->>'lining', 's') END])::NUMERIC
                * COALESCE((elem->>'no')::NUMERIC, 1)
            )
          ELSE elem
        END
      ELSE elem
    END
  ), '[]'::jsonb)
  INTO v_result
  FROM jsonb_array_elements(p_garments) AS elem;

  RETURN v_result;
END;
$$;

-- Re-run the "still-open orders get a live payable" backfill now that both functions resolve the
-- flattened rate shape — a no-op unless an order's live estimate actually changes as a result.
UPDATE orders
SET garments = recalc_tailor_payables(garments, order_type)
WHERE ready_at IS NULL
  AND payables_confirmed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(garments) elem WHERE COALESCE(elem->>'tailor', '') <> ''
  );
