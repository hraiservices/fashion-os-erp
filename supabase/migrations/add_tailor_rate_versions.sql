-- Tailor rates were a single flat app_settings.tailorRates value with no history and no way to
-- schedule a change for later — a rate edited today took effect immediately (via the live
-- recalc trigger, add_early_tailor_payables.sql) with no way to say "these new rates start next
-- Monday" and no record of what the rate was before. The owner wants:
--   1. A full, permanent version history of every rate change (browsable later).
--   2. Each change tagged with an "effective from" date the payroll manager picks.
--   3. Once a version's effective date arrives, it becomes "current" for every order not yet
--      frozen (ready_at or payables_confirmed_at set) — not bound to any order's own in_date.
--   4. Only one *pending* (future-dated) change at a time — setting a new future-dated change
--      replaces whatever was previously scheduled.
-- Scope: tailor payable rates only. The customer-facing rate card (app_settings.rates) is
-- unaffected and keeps applying immediately, as before.
CREATE TABLE IF NOT EXISTS tailor_rate_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rates          JSONB NOT NULL,
  effective_from DATE NOT NULL UNIQUE,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tailor_rate_versions ENABLE ROW LEVEL SECURITY;

-- Read-only for any logged-in user — same exposure the flat app_settings.tailorRates key
-- already had (order-form.tsx and the profitability reports read it client-side to show
-- estimates), so this isn't widening access, just relocating it.
DROP POLICY IF EXISTS "tailor_rate_versions_select" ON tailor_rate_versions;
CREATE POLICY "tailor_rate_versions_select" ON tailor_rate_versions
  FOR SELECT TO authenticated
  USING (true);

-- No direct INSERT/UPDATE/DELETE policy is created, so RLS denies all direct writes from
-- `authenticated` by default — the only way to write is the SECURITY DEFINER RPC below, called
-- only from the service-role client after a managePayroll check (same lockdown pattern as
-- set_tailor_rates(), see add_tailor_rates_lockdown.sql / lockdown_set_tailor_rates_rpc.sql).

-- Seed the initial version from whatever app_settings.tailorRates already holds (or an empty
-- rate card if it was never set), effective from the beginning of time so it's always "current"
-- until a real change is scheduled.
INSERT INTO tailor_rate_versions (rates, effective_from, created_by)
SELECT COALESCE((SELECT value FROM app_settings WHERE key = 'tailorRates'), '{}'::jsonb), DATE '1970-01-01', 'migration'
WHERE NOT EXISTS (SELECT 1 FROM tailor_rate_versions);

-- The currently-active rate card as of today — the single source of truth every payable
-- computation and every client-facing estimate should read from. Computed live on every call
-- (no cache to go stale), so a scheduled future change takes effect the instant its date arrives
-- with no cron job needed to "activate" it.
CREATE OR REPLACE FUNCTION current_tailor_rates()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT rates FROM tailor_rate_versions
  WHERE effective_from <= CURRENT_DATE
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION current_tailor_rates() TO authenticated;

-- The only sanctioned way to write a tailor rate version. Enforces "only one pending change at
-- a time" by deleting any not-yet-effective version before inserting the new one. SECURITY
-- DEFINER + granted to service_role only (never `authenticated`) so it can only be reached
-- through /api/settings/tailor-rates after that route's managePayroll check — see
-- lockdown_set_tailor_rates_rpc.sql for why granting straight to `authenticated` on a
-- compensation-data write is a privilege-escalation hole.
CREATE OR REPLACE FUNCTION set_tailor_rates_versioned(p_rates JSONB, p_effective_from DATE, p_created_by TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM tailor_rate_versions WHERE effective_from > CURRENT_DATE;

  INSERT INTO tailor_rate_versions (rates, effective_from, created_by)
  VALUES (p_rates, p_effective_from, p_created_by)
  ON CONFLICT (effective_from) DO UPDATE SET rates = EXCLUDED.rates, created_by = EXCLUDED.created_by;

  -- Keep the legacy app_settings.tailorRates key mirroring whatever is current today, for any
  -- code path not yet migrated off it. Harmless no-op once every reader goes through
  -- current_tailor_rates()/this table directly.
  INSERT INTO app_settings (key, value) VALUES ('tailorRates', current_tailor_rates())
  ON CONFLICT (key) DO UPDATE SET value = current_tailor_rates();
END;
$$;

REVOKE ALL ON FUNCTION set_tailor_rates_versioned(JSONB, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_tailor_rates_versioned(JSONB, DATE, TEXT) TO service_role;

-- recalc_tailor_payables() and snapshot_tailor_payables() now read the live-resolved current
-- version instead of the flat app_settings key directly, so a scheduled rate change reaches
-- order details and the Tailor Payables report the moment its effective date arrives — no code
-- path needs to change for that to happen, since both functions already run on every order
-- write while the order isn't yet frozen.
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

  v_rates := current_tailor_rates();
  v_column := CASE WHEN p_order_type = 'alteration' THEN 'alteration' ELSE 'new' END;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN COALESCE(elem->>'tailor', '') <> '' THEN
        elem || jsonb_build_object(
          'payableAmount',
          COALESCE((v_rates #>> ARRAY[elem->>'type', COALESCE(elem->>'lining', 's'), v_column])::NUMERIC, 0)
            * COALESCE((elem->>'no')::NUMERIC, 1)
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
  v_rates  JSONB;
  v_result JSONB;
  v_column TEXT;
BEGIN
  IF p_garments IS NULL THEN
    RETURN p_garments;
  END IF;

  v_rates := current_tailor_rates();
  v_column := CASE WHEN p_order_type = 'alteration' THEN 'alteration' ELSE 'new' END;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN COALESCE(elem->>'tailor', '') <> '' AND elem->'payableAmount' IS NULL THEN
        CASE
          WHEN (v_rates #>> ARRAY[elem->>'type', COALESCE(elem->>'lining', 's'), v_column]) IS NOT NULL THEN
            elem || jsonb_build_object(
              'payableAmount',
              (v_rates #>> ARRAY[elem->>'type', COALESCE(elem->>'lining', 's'), v_column])::NUMERIC
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

-- Re-run the "still-open orders get a live payable" backfill from add_early_tailor_payables.sql
-- now that recalc_tailor_payables() resolves rates from tailor_rate_versions instead of
-- app_settings — a no-op unless the seeded version's rates actually differ from what was there.
UPDATE orders
SET garments = recalc_tailor_payables(garments, order_type)
WHERE ready_at IS NULL
  AND payables_confirmed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(garments) elem WHERE COALESCE(elem->>'tailor', '') <> ''
  );
