-- Fixes for the P0 findings from today's forensic audit of the tailor piece-rate feature:
--
-- P0-1: payables_confirmed_at / labor_payable_confirmed_at were only guarded by the
--   managePayroll check in the API route -- RLS on orders/work_orders is the same permissive
--   USING(true) pattern as every other table, so a client could set them directly, bypassing
--   the whole "a payroll manager must confirm" design. A BEFORE UPDATE trigger now blocks any
--   change to these columns unless a session-local flag is set, which only the new
--   confirm_order_payables()/confirm_wo_payable() SECURITY DEFINER RPCs ever set. Ordinary
--   updates (edit_order, set_order_stage, useCompleteWorkOrder's status/materials writes) never
--   touch these columns, so NEW = OLD for them and the trigger no-ops -- no regression risk.
--
-- P0-2: nothing marked a confirmed payable as "already paid", so re-running payroll over an
--   adjusted/overlapping period could double-pay, and a payable confirmed after its own
--   period's payroll already ran was silently lost forever. piece_rate_paid_at is stamped by
--   the payroll run the moment it sums an order/work-order's payables into a payslip; the run
--   query filters on `piece_rate_paid_at IS NULL` (not a period lower bound), so anything still
--   unpaid always surfaces in the next run regardless of how late it was confirmed, and nothing
--   already paid can ever be summed twice.
--
-- P0-3: preserve_garment_payables() matched garments by array position -- deleting or
--   reordering a garment mid-edit could reattach a frozen payableAmount to the wrong garment.
--   Now matches by a stable `lineId` (added client-side, carried through edits) when both the
--   old and new garment have one; falls back to positional matching only for legacy garments
--   that predate lineId, which is no worse than today's behavior for those, not a regression.
--
-- P0-4: a garment with a tailor but no matching tailor-rate-card entry silently snapshotted a
--   frozen payableAmount of 0, forever, with no way to correct it once the rate card was
--   filled in (snapshot only ever fired once, on ready_at IS NULL). Now: the fallback leaves
--   payableAmount unset (not 0) when no rate resolves, and set_order_stage retries the
--   snapshot every time an order enters "ready" (not just the first time) -- since
--   snapshot_tailor_payables only ever fills garments that are still missing a payableAmount,
--   this is a no-op for every garment that already got a real snapshot, and only gives
--   previously-unresolvable garments a real path to get corrected (drag back to stitching,
--   forward to ready again, once the rate card has been filled in).

ALTER TABLE orders      ADD COLUMN IF NOT EXISTS piece_rate_paid_at TIMESTAMPTZ;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS piece_rate_paid_at TIMESTAMPTZ;

-- ── P0-1: trigger-guarded confirmation columns ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION guard_payables_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    IF NEW.payables_confirmed_at IS DISTINCT FROM OLD.payables_confirmed_at
       AND current_setting('app.allow_payable_confirm', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'payables_confirmed_at can only be set via confirm_order_payables()';
    END IF;
  ELSIF TG_TABLE_NAME = 'work_orders' THEN
    IF NEW.labor_payable_confirmed_at IS DISTINCT FROM OLD.labor_payable_confirmed_at
       AND current_setting('app.allow_payable_confirm', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'labor_payable_confirmed_at can only be set via confirm_wo_payable()';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_orders_payable_confirm ON orders;
CREATE TRIGGER trg_guard_orders_payable_confirm
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_payables_confirm();

DROP TRIGGER IF EXISTS trg_guard_wo_payable_confirm ON work_orders;
CREATE TRIGGER trg_guard_wo_payable_confirm
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION guard_payables_confirm();

-- SECURITY DEFINER functions run as the table owner, which is exempt from both RLS and this
-- trigger's own RLS-adjacent check is irrelevant here -- what makes the write legal is the
-- set_config() flag below, scoped `is_local = true` so it never leaks past this transaction.
CREATE OR REPLACE FUNCTION confirm_order_payables(p_order_id TEXT, p_user_email TEXT)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_payable_confirm', 'true', true);
  RETURN QUERY
  UPDATE orders
  SET payables_confirmed_at = COALESCE(payables_confirmed_at, NOW()),
      payables_confirmed_by = COALESCE(payables_confirmed_by, p_user_email)
  WHERE id = p_order_id
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_wo_payable(p_wo_id TEXT, p_user_email TEXT)
RETURNS SETOF work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_payable_confirm', 'true', true);
  RETURN QUERY
  UPDATE work_orders
  SET labor_payable_confirmed_at = COALESCE(labor_payable_confirmed_at, NOW()),
      labor_payable_confirmed_by = COALESCE(labor_payable_confirmed_by, p_user_email)
  WHERE id = p_wo_id
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_order_payables(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_wo_payable(TEXT, TEXT) TO authenticated;

-- ── P0-3: lineId-based garment matching (falls back to position for legacy garments) ────────

CREATE OR REPLACE FUNCTION preserve_garment_payables(p_new_garments JSONB, p_old_garments JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_new_garments IS NULL THEN
    RETURN p_new_garments;
  END IF;

  IF p_old_garments IS NULL THEN
    SELECT COALESCE(jsonb_agg(elem - 'payableAmount'), '[]'::jsonb)
    INTO v_result
    FROM jsonb_array_elements(p_new_garments) AS elem;
    RETURN v_result;
  END IF;

  SELECT COALESCE(jsonb_agg(
    CASE
      -- Prefer matching by lineId when the new element has one and an old element shares it --
      -- immune to reordering/deletion elsewhere in the array, unlike positional matching.
      WHEN new_elem ? 'lineId' AND new_elem->>'lineId' <> '' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_old_garments) o
        WHERE o->>'lineId' = new_elem->>'lineId' AND o ? 'payableAmount'
      ) THEN
        new_elem || jsonb_build_object(
          'payableAmount',
          (SELECT o -> 'payableAmount' FROM jsonb_array_elements(p_old_garments) o WHERE o->>'lineId' = new_elem->>'lineId' LIMIT 1)
        )
      WHEN new_elem ? 'lineId' AND new_elem->>'lineId' <> '' THEN
        -- Has a lineId but no old element shares it (new line) -- never inherit by position.
        new_elem - 'payableAmount'
      -- Legacy garment with no lineId at all -- fall back to the old positional match so
      -- existing orders don't regress further than they already were.
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

-- ── P0-4: don't freeze a missing rate at 0; retry the snapshot on every re-entry to "ready" ──

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
      WHEN COALESCE(elem->>'tailor', '') <> '' AND elem->'payableAmount' IS NULL THEN
        CASE
          WHEN (v_rates #>> ARRAY[elem->>'type', COALESCE(elem->>'lining', 's'), v_column]) IS NOT NULL THEN
            elem || jsonb_build_object(
              'payableAmount',
              (v_rates #>> ARRAY[elem->>'type', COALESCE(elem->>'lining', 's'), v_column])::NUMERIC
                * COALESCE((elem->>'no')::NUMERIC, 1)
            )
          -- No rate configured for this type/lining/order-type yet -- leave payableAmount
          -- unset (not 0) so it stays eligible for the next time this order re-enters "ready",
          -- instead of freezing a wrong figure forever.
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
    -- Unconditional on ready_at now (was `AND ready_at IS NULL`) -- snapshot_tailor_payables
    -- only ever fills garments still missing a payableAmount, so re-entering "ready" is a
    -- no-op for anything already snapshotted and a real retry for anything that wasn't.
    garments = CASE
                 WHEN p_new_status = 'ready'
                 THEN snapshot_tailor_payables(garments, order_type)
                 ELSE garments
               END
  WHERE id = p_order_id
    AND (p_expected_status IS NULL OR status = p_expected_status)
  RETURNING *;
END;
$$;
