-- ============================================================
--  award_loyalty_points RPC
--  Run this once in Supabase → SQL Editor (same project as schema_v16_complete.sql).
--
--  Replaces the old app's client-side `loyaltyQueueRef` promise queue (a workaround
--  for the fact that two award calls racing from the browser could both read the same
--  stale balance). Here the row lock (`FOR UPDATE`) inside a single Postgres function
--  serializes concurrent awards for the same customer at the database level — a
--  correctness guarantee the old approach could only approximate.
--
--  Preserves exact business rules from Stitching_Manager_Pro_v16.html ~lines 17247-17281:
--   - balance floors at 0, never negative
--   - total_points_earned only increases on positive pts (redemptions don't reduce it)
--   - idempotency: a positive per-order bonus (type, orderId) is granted at most once
--   - history capped at 50 entries, newest first
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_loyalty_points(
  p_mobile   TEXT,
  p_name     TEXT,
  p_pts      INTEGER,
  p_type     TEXT,
  p_order_id TEXT,
  p_note     TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust_id TEXT := 'CUST-' || p_mobile;
  v_bal     INTEGER;
  v_total   INTEGER;
  v_hist    JSONB;
  v_already BOOLEAN;
BEGIN
  IF p_pts IS NULL OR p_pts = 0 OR p_mobile IS NULL OR p_mobile = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.customers (id, name, mobile)
  VALUES (v_cust_id, COALESCE(p_name, ''), p_mobile)
  ON CONFLICT (id) DO NOTHING;

  SELECT loyalty_points, total_points_earned, loyalty_history
    INTO v_bal, v_total, v_hist
    FROM public.customers
    WHERE id = v_cust_id
    FOR UPDATE;

  v_bal := COALESCE(v_bal, 0);
  v_total := COALESCE(v_total, 0);
  v_hist := COALESCE(v_hist, '[]'::jsonb);

  IF p_order_id IS NOT NULL AND p_pts > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_hist) e
      WHERE e->>'type' = p_type AND e->>'orderId' = p_order_id
    ) INTO v_already;
    IF v_already THEN
      RETURN;
    END IF;
  END IF;

  v_bal := GREATEST(0, v_bal + p_pts);
  IF p_pts > 0 THEN
    v_total := v_total + p_pts;
  END IF;

  v_hist := jsonb_build_array(
    jsonb_build_object(
      'date', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'type', p_type,
      'pts', p_pts,
      'orderId', p_order_id,
      'note', COALESCE(p_note, '')
    )
  ) || v_hist;

  IF jsonb_array_length(v_hist) > 50 THEN
    SELECT jsonb_agg(elem) INTO v_hist
    FROM (
      SELECT elem FROM jsonb_array_elements(v_hist) WITH ORDINALITY AS t(elem, i)
      WHERE i <= 50
    ) capped;
  END IF;

  UPDATE public.customers
     SET loyalty_points = v_bal,
         total_points_earned = v_total,
         loyalty_history = v_hist,
         updated_at = now()
   WHERE id = v_cust_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_loyalty_points(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
