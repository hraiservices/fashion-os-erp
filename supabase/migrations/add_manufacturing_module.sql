-- Run this once in your Supabase SQL editor
-- Phase 3: Manufacturing — Work Orders that turn raw materials into finished-goods stock,
-- using the same tailor pool as stitching orders (Settings > Tailors), with wastage tracking
-- and per-piece labor cost. Materials are stored as JSONB (same pattern as purchase bill items):
-- [{raw_material_id, raw_material_name, unit_name, qty_planned, qty_used, qty_wasted, unit_cost}]
-- — qty_planned comes from the product's Bill of Materials × qty_to_produce at creation time;
-- qty_used/qty_wasted are filled in when the work order is completed.

CREATE TABLE IF NOT EXISTS work_orders (
  id                   UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  wo_number            TEXT          NOT NULL UNIQUE,
  product_id           UUID          NOT NULL REFERENCES products(id),
  product_name         TEXT          NOT NULL DEFAULT '',
  qty_to_produce       NUMERIC(10,2) NOT NULL,
  tailor               TEXT          NOT NULL DEFAULT '',
  start_date           DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date             DATE,
  status               TEXT          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'qc', 'completed')),
  materials            JSONB         NOT NULL DEFAULT '[]',
  labor_cost_per_piece NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Cost fields are computed once, at completion, and frozen — they must not silently
  -- recompute later if raw_materials.cost_per_unit changes (that would rewrite history).
  material_cost        NUMERIC(12,2),
  wastage_cost          NUMERIC(12,2),
  labor_cost           NUMERIC(12,2),
  total_cost           NUMERIC(12,2),
  cost_per_unit         NUMERIC(12,2),
  notes                TEXT          NOT NULL DEFAULT '',
  completed_at         TIMESTAMPTZ,
  created_by           TEXT,
  created_at           TIMESTAMPTZ   DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_product ON work_orders (product_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_tailor ON work_orders (tailor);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders (status);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON work_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
