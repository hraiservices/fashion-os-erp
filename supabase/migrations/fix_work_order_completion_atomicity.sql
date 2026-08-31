-- Run this once in your Supabase SQL editor.
--
-- Forensic pre-launch audit found: completing a work order
-- (src/app/api/work-orders/[id]/complete/route.ts) did the status update, the raw-material
-- consumption ledger rows, and the finished-goods production ledger row as three separate,
-- independent Supabase calls. A crash/timeout between any of them left a work order marked
-- "completed" (blocking re-completion) with materials consumed but nothing produced, or the
-- reverse — silently destroying or fabricating stock with no automatic way to detect or reverse
-- it. This RPC wraps all three in one transaction: either the whole completion happens, or none
-- of it does. It also now takes a row lock on the work order before checking its status, closing
-- a race where two concurrent "complete" clicks on the same work order could both pass the
-- not-already-completed check and both move stock.
CREATE OR REPLACE FUNCTION complete_work_order(
  p_work_order_id  UUID,
  p_materials      JSONB,
  p_material_cost  NUMERIC,
  p_wastage_cost   NUMERIC,
  p_labor_cost     NUMERIC,
  p_total_cost     NUMERIC,
  p_cost_per_unit  NUMERIC,
  p_consume        JSONB,
  p_product_id     UUID,
  p_qty_to_produce NUMERIC,
  p_wo_number      TEXT,
  p_created_by     TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_item JSONB;
BEGIN
  SELECT status INTO v_status FROM work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found: %', p_work_order_id;
  END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'This work order is already completed.';
  END IF;

  UPDATE work_orders SET
    status = 'completed',
    materials = p_materials,
    material_cost = p_material_cost,
    wastage_cost = p_wastage_cost,
    labor_cost = p_labor_cost,
    total_cost = p_total_cost,
    cost_per_unit = p_cost_per_unit,
    completed_at = now()
  WHERE id = p_work_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_consume)
  LOOP
    INSERT INTO inventory_ledger (item_type, item_id, movement, ref_type, ref_id, note, created_by)
    VALUES ('raw_material', (v_item->>'itemId')::uuid, (v_item->>'movement')::numeric, 'work_order_consume', p_work_order_id, v_item->>'note', p_created_by);
  END LOOP;

  INSERT INTO inventory_ledger (item_type, item_id, movement, ref_type, ref_id, note, created_by)
  VALUES ('product', p_product_id, p_qty_to_produce, 'work_order_produce', p_work_order_id, 'Produced by ' || p_wo_number, p_created_by);
END;
$$;
