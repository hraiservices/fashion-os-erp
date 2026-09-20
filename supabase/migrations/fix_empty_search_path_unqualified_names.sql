-- Forensic Supabase audit (2026-09-19/20): set_module_entitlements(jsonb), set_tailor_rates(jsonb),
-- set_tailor_rates_versioned(jsonb,date,text), and rename_garment_type(text,text) were hardened
-- with `SET search_path TO ''` (an earlier pass of this same audit, closing the "mutable
-- search_path" advisor warning) but their bodies reference tables unqualified
-- (`app_settings`, `tailor_rate_versions`, `orders`) rather than schema-qualified
-- (`public.app_settings`, etc).
--
-- Reproduced directly: an empty search_path means NOTHING outside pg_catalog resolves an
-- unqualified name, so every one of these 4 functions currently throws
-- `ERROR: relation "app_settings" does not exist` (or "tailor_rate_versions"/"orders") on every
-- single invocation. This is not a hardening nitpick — it is a live P0 functional bug: module
-- licensing toggles, tailor pay-rate updates, and garment-type renames (all wired to real
-- settings pages: /api/settings/role-defaults, /api/settings/tailor-rates,
-- /api/settings/garment-types/rename, use-module-entitlements.ts) are broken right now.
--
-- Fix: re-create each function with every table reference schema-qualified to `public.`, keeping
-- `SET search_path TO ''` (the search_path hardening itself was correct — only the body needed
-- to catch up to it). Logic is otherwise byte-for-byte identical to the live definitions pulled
-- via pg_get_functiondef() during this audit.
--
-- Also fixes current_tailor_rates() (called from inside set_tailor_rates_versioned): it is not
-- itself SECURITY DEFINER and carries no SET search_path override of its own, so when Postgres
-- runs it as a nested call from within a function whose search_path is '', it inherits that
-- empty search_path from the caller — reproduced directly: calling
-- set_tailor_rates_versioned(...) failed with `relation "tailor_rate_versions" does not exist`,
-- context "SQL function current_tailor_rates during inlining", even after fixing the four
-- functions above on their own. Schema-qualifying its one reference fixes it for both call paths
-- (a plain top-level call, and this nested one).

CREATE OR REPLACE FUNCTION public.set_module_entitlements(p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF lower(coalesce(auth.jwt()->>'email', '')) <> lower('connect@himanshurajput.com') THEN
    RAISE EXCEPTION 'Not authorized to change module entitlements';
  END IF;

  INSERT INTO public.app_settings (key, value) VALUES ('moduleEntitlements', p_value)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_tailor_rates(p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.app_settings (key, value) VALUES ('tailorRates', p_value)
  ON CONFLICT (key) DO UPDATE SET value = p_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_tailor_rates_versioned(p_rates jsonb, p_effective_from date, p_created_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public.tailor_rate_versions WHERE effective_from > CURRENT_DATE;

  INSERT INTO public.tailor_rate_versions (rates, effective_from, created_by)
  VALUES (p_rates, p_effective_from, p_created_by)
  ON CONFLICT (effective_from) DO UPDATE SET rates = EXCLUDED.rates, created_by = EXCLUDED.created_by;

  -- Keep the legacy app_settings.tailorRates key mirroring whatever is current today, for any
  -- code path not yet migrated off it. Harmless no-op once every reader goes through
  -- current_tailor_rates()/this table directly.
  INSERT INTO public.app_settings (key, value) VALUES ('tailorRates', public.current_tailor_rates())
  ON CONFLICT (key) DO UPDATE SET value = public.current_tailor_rates();
END;
$function$;

CREATE OR REPLACE FUNCTION public.rename_garment_type(p_old text, p_new text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  SELECT value INTO v_rates FROM public.app_settings WHERE key = 'rates';
  IF v_rates IS NULL OR NOT (v_rates ? p_old) THEN
    RAISE EXCEPTION 'Garment type "%" does not exist', p_old;
  END IF;
  IF v_rates ? p_new THEN
    RAISE EXCEPTION 'A garment type named "%" already exists', p_new;
  END IF;

  -- Customer-facing rate card.
  UPDATE public.app_settings
  SET value = (value - p_old) || jsonb_build_object(p_new, value->p_old)
  WHERE key = 'rates' AND value ? p_old;

  -- Fabric usage planning, keyed the same way.
  UPDATE public.app_settings
  SET value = (value - p_old) || jsonb_build_object(p_new, value->p_old)
  WHERE key = 'fabricUsage' AND value ? p_old;

  -- Tailor payable rate card — every version, current and historical, per explicit choice to
  -- keep the garment type name consistent everywhere rather than freezing old payroll records
  -- under a now-renamed type.
  UPDATE public.tailor_rate_versions
  SET rates = (rates - p_old) || jsonb_build_object(p_new, rates->p_old)
  WHERE rates ? p_old;

  -- Every existing order's garments array — only the elements whose type matches get touched,
  -- everything else in that garment object (lining, qty, tailor, amount, ...) is preserved.
  WITH updated AS (
    UPDATE public.orders
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
$function$;

CREATE OR REPLACE FUNCTION public.current_tailor_rates()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT rates FROM public.tailor_rate_versions
  WHERE effective_from <= CURRENT_DATE
  ORDER BY effective_from DESC
  LIMIT 1;
$function$;
