-- Adds a "finishing" pipeline stage (received -> cutting -> stitching -> finishing -> ready ->
-- delivered -> payment) and a lifetime rework_count column so "how many times has this order
-- been sent back, total" survives even after the current rework flag is cleared and re-set
-- (rework_flag/reason/flagged_by/flagged_at, from add_stitching_orders_v1_features.sql,
-- describe only the CURRENT flag and get overwritten on every toggle).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS rework_count INTEGER NOT NULL DEFAULT 0;

-- set_order_stage(): identical to tailor_payable_manual_entry.sql's version (the current
-- source of truth — see that file's own comment trail for why the garments handling was
-- dropped), just with 'finishing' added to the allowed stage list.
CREATE OR REPLACE FUNCTION set_order_stage(
  p_order_id        TEXT,
  p_new_status      TEXT,
  p_history_line    TEXT,
  p_expected_status TEXT DEFAULT NULL
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_new_status NOT IN ('received','cutting','stitching','finishing','ready','delivered','payment') THEN
    RAISE EXCEPTION 'Invalid stage: %', p_new_status;
  END IF;

  RETURN QUERY
  UPDATE orders
  SET
    status   = p_new_status,
    history  = history || to_jsonb(p_history_line),
    ready_at = CASE WHEN p_new_status = 'ready' AND ready_at IS NULL THEN NOW() ELSE ready_at END
  WHERE id = p_order_id
    AND (p_expected_status IS NULL OR status = p_expected_status)
  RETURNING *;
END;
$$;

-- set_order_rework(): same as add_stitching_orders_v1_features.sql's version, plus
-- incrementing rework_count every time the flag is newly SET (not on clear, and not on a
-- redundant "set while already set" call — only a fresh flagging counts as one more time).
CREATE OR REPLACE FUNCTION set_order_rework(
  p_order_id     TEXT,
  p_flag         BOOLEAN,
  p_reason       TEXT,
  p_user         TEXT,
  p_history_line TEXT
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE orders
  SET
    rework_flag       = p_flag,
    rework_reason      = CASE WHEN p_flag THEN p_reason ELSE '' END,
    rework_flagged_by  = CASE WHEN p_flag THEN p_user ELSE NULL END,
    rework_flagged_at  = CASE WHEN p_flag THEN NOW() ELSE NULL END,
    rework_count       = CASE WHEN p_flag AND NOT rework_flag THEN rework_count + 1 ELSE rework_count END,
    history             = history || to_jsonb(p_history_line)
  WHERE id = p_order_id
  RETURNING *;
END;
$$;
