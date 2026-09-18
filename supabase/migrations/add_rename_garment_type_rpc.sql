-- Renaming a garment type (Settings > Rate Card) needs to cascade everywhere that name is used
-- as a plain string key/value, not just the customer rate card itself: the Fabric Usage
-- settings, every version of the Tailor Payable Rate Card (including historical payroll
-- versions, per the explicit choice to keep those consistent rather than "frozen as recorded"),
-- and the `type` field saved inside every existing order's `garments` JSONB array. A rename
-- that only touched the rate card key would silently orphan every already-created order and
-- historical payroll record under the old name.
--
-- One SECURITY DEFINER RPC does all of it atomically (single transaction — a rename either
-- fully lands or fully rolls back), granted to service_role only, same lockdown pattern as
-- set_tailor_rates_versioned in add_tailor_rate_versions.sql — called from
-- /api/settings/garment-types/rename via the service-role client, never directly by
-- `authenticated`.
CREATE OR REPLACE FUNCTION rename_garment_type(p_old text, p_new text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rates jsonb;
  v_updated_orders integer;
BEGIN
  IF p_old IS NULL OR btrim(p_old) = '' OR p_new IS NULL OR btrim(p_new) = '' THEN
    RAISE EXCEPTION 'Garment type names cannot be empty';
  END IF;
  IF p_old = p_new THEN
    RETURN 0;
  END IF;

  SELECT value INTO v_rates FROM app_settings WHERE key = 'rates';
  IF v_rates IS NULL OR NOT (v_rates ? p_old) THEN
    RAISE EXCEPTION 'Garment type "%" does not exist', p_old;
  END IF;
  IF v_rates ? p_new THEN
    RAISE EXCEPTION 'A garment type named "%" already exists', p_new;
  END IF;

  -- Customer-facing rate card.
  UPDATE app_settings
  SET value = (value - p_old) || jsonb_build_object(p_new, value->p_old)
  WHERE key = 'rates' AND value ? p_old;

  -- Fabric usage planning, keyed the same way.
  UPDATE app_settings
  SET value = (value - p_old) || jsonb_build_object(p_new, value->p_old)
  WHERE key = 'fabricUsage' AND value ? p_old;

  -- Tailor payable rate card — every version, current and historical, per explicit choice to
  -- keep the garment type name consistent everywhere rather than freezing old payroll records
  -- under a now-renamed type.
  UPDATE tailor_rate_versions
  SET rates = (rates - p_old) || jsonb_build_object(p_new, rates->p_old)
  WHERE rates ? p_old;

  -- Every existing order's garments array — only the elements whose type matches get touched,
  -- everything else in that garment object (lining, qty, tailor, amount, ...) is preserved.
  WITH updated AS (
    UPDATE orders
    SET garments = (
      SELECT jsonb_agg(CASE WHEN g->>'type' = p_old THEN jsonb_set(g, '{type}', to_jsonb(p_new)) ELSE g END)
      FROM jsonb_array_elements(garments) AS g
    )
    WHERE garments IS NOT NULL AND garments @> jsonb_build_array(jsonb_build_object('type', p_old))
    RETURNING id
  )
  SELECT count(*) INTO v_updated_orders FROM updated;

  RETURN v_updated_orders;
END;
$$;

GRANT EXECUTE ON FUNCTION rename_garment_type(text, text) TO service_role;
