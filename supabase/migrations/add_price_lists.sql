-- Price Lists: customer-tier product pricing overrides.

CREATE TABLE IF NOT EXISTS price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE (price_list_id, product_id)
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_list_id UUID REFERENCES price_lists(id) ON DELETE SET NULL;

ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON price_lists FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON price_list_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
