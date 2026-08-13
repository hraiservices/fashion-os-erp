-- Atomic stage transition + history append for stitching orders.
--
-- v2: adds p_expected_status so concurrent advance-stage requests don't silently
-- skip production stages. The UPDATE only fires when the current DB status matches
-- what the JS caller read before computing next-stage. If another request already
-- advanced the stage, 0 rows are returned and the API responds with 409 Conflict.
-- Stage string is validated in-function so direct RPC calls can't corrupt status.
CREATE OR REPLACE FUNCTION set_order_stage(
  p_order_id       TEXT,
  p_new_status     TEXT,
  p_history_line   TEXT,
  p_expected_status TEXT DEFAULT NULL   -- NULL = skip optimistic-lock check (legacy callers)
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
    status  = p_new_status,
    history = history || to_jsonb(p_history_line)
  WHERE id = p_order_id
    AND (p_expected_status IS NULL OR status = p_expected_status)
  RETURNING *;
END;
$$;
