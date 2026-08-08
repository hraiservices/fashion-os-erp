-- Run this once in your Supabase SQL editor
-- Phase 1: Inventory foundation — units of measure, raw materials, products, BOM, stock ledger.

CREATE TABLE IF NOT EXISTS units_of_measure (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO units_of_measure (name) VALUES ('meters'), ('pieces'), ('spools')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS raw_materials (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT          NOT NULL,
  unit_id         UUID          NOT NULL REFERENCES units_of_measure(id),
  cost_per_unit   NUMERIC(10,2) NOT NULL DEFAULT 0,
  category        TEXT          NOT NULL DEFAULT '',
  low_stock_alert NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes           TEXT          NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT          NOT NULL,
  sku             TEXT          NOT NULL UNIQUE,
  category        TEXT          NOT NULL DEFAULT '',
  selling_price   NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,2)  NOT NULL DEFAULT 5,
  low_stock_alert NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes           TEXT          NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Bill of Materials: how much of each raw material one unit of a product consumes.
CREATE TABLE IF NOT EXISTS bill_of_materials (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  raw_material_id UUID          NOT NULL REFERENCES raw_materials(id),
  qty_required    NUMERIC(10,3) NOT NULL,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (product_id, raw_material_id)
);

-- Single source of truth for all stock movement. Current stock is always
-- SUM(movement) — never a stored/cached column that can drift.
CREATE TABLE IF NOT EXISTS inventory_ledger (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  item_type  TEXT        NOT NULL CHECK (item_type IN ('raw_material', 'product')),
  item_id    UUID        NOT NULL,
  movement   NUMERIC(12,3) NOT NULL,
  ref_type   TEXT        NOT NULL CHECK (ref_type IN ('opening', 'purchase', 'purchase_return', 'sale', 'sale_return', 'work_order_consume', 'work_order_produce', 'adjustment')),
  ref_id     TEXT,
  note       TEXT        NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_ledger_item ON inventory_ledger (item_type, item_id);

CREATE OR REPLACE VIEW inventory_stock AS
SELECT item_type, item_id, COALESCE(SUM(movement), 0) AS stock_qty
FROM inventory_ledger
GROUP BY item_type, item_id;

ALTER TABLE units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON units_of_measure FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON raw_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON bill_of_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON inventory_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);
