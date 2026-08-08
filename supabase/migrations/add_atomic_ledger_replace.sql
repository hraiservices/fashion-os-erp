-- Run this once in your Supabase SQL editor.
--
-- Fixes a real data-integrity bug: editing a Purchase Bill or Sales Invoice replaced its
-- inventory_ledger rows via two separate client-side calls (DELETE then INSERT). Two
-- concurrent edits to the same document could race and double-insert; a failure between
-- the two calls silently dropped the ledger rows for that document with no error surfaced.
-- Wrapping both statements in a single plpgsql function makes the replace atomic — either
-- both happen or neither does, and Postgres's row locking serializes concurrent callers.
CREATE OR REPLACE FUNCTION replace_inventory_ledger(
  p_ref_type TEXT,
  p_ref_id TEXT,
  p_rows JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM inventory_ledger WHERE ref_type = p_ref_type AND ref_id = p_ref_id;

  INSERT INTO inventory_ledger (item_type, item_id, movement, ref_type, ref_id, note, created_by)
  SELECT
    x.item_type,
    x.item_id,
    x.movement,
    p_ref_type,
    p_ref_id,
    COALESCE(x.note, ''),
    x.created_by
  FROM jsonb_to_recordset(p_rows) AS x(
    item_type TEXT,
    item_id UUID,
    movement NUMERIC(12,3),
    note TEXT,
    created_by TEXT
  );
END;
$$;
