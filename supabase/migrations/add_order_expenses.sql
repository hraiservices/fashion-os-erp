-- Stitching order expenses: flexible per-order line items (lining, thread, lace, buttons,
-- electricity, ...) that feed into order profitability alongside the existing fabric_cost/
-- other_cost fields on orders. A separate table (not a JSONB column on orders, unlike
-- garments) since these are staff-entered cost records worth their own created_by/created_at
-- audit trail and future per-category reporting, not a customer-facing document like garments.
--
-- qty/unit/rate are nullable — some expenses are qty*rate (2 meter lining @ ₹100/meter),
-- others are a flat amount with no meaningful unit (electricity, machine time). amount is
-- always the authoritative total either way (computed client-side as qty*rate when both are
-- present, entered directly otherwise) so every downstream reader just sums `amount`.
CREATE TABLE IF NOT EXISTS order_expenses (
  id         UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id   TEXT          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  category   TEXT          NOT NULL,
  qty        NUMERIC(10,2),
  unit       TEXT,
  rate       NUMERIC(10,2),
  amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_expenses_order ON order_expenses (order_id);

ALTER TABLE order_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON order_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
