-- Atomic stage transition + history append for stitching orders.
--
-- The advance-stage and set-stage routes previously did a JavaScript read-modify-write
-- on the history JSONB array (read order.history, push a line in memory, write the whole
-- array back). A concurrent payment recorded via record_order_payment (which is already
-- atomic) could have its history line silently overwritten and dropped. This function
-- mirrors the same pattern: a single UPDATE does both the status write and the history
-- append via Postgres's jsonb concatenation operator, which row-locks the row for the
-- duration so no concurrent write can race it.
CREATE OR REPLACE FUNCTION set_order_stage(
  p_order_id   TEXT,
  p_new_status TEXT,
  p_history_line TEXT
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE orders
  SET
    status  = p_new_status,
    history = history || to_jsonb(p_history_line)
  WHERE id = p_order_id
  RETURNING *;
END;
$$;
