-- Run this once in your Supabase SQL editor
CREATE TABLE IF NOT EXISTS warehouses (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  address    TEXT        NOT NULL DEFAULT '',
  is_default BOOLEAN     NOT NULL DEFAULT false,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON warehouses
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO warehouses (name, is_default, active)
SELECT 'Main Warehouse', true, true
WHERE NOT EXISTS (SELECT 1 FROM warehouses);

-- Nullable by design: existing purchase/sale/manufacturing/adjustment code paths never set
-- this and keep working unchanged (NULL reads as "Main Warehouse" in the UI via COALESCE
-- against the default warehouse). Only the new Stock Transfer feature writes real values.
ALTER TABLE inventory_ledger ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
