-- Recurring invoice profiles: a saved invoice template that generates a fresh Draft
-- invoice on a schedule (weekly/monthly/quarterly/yearly), until an end condition is hit.

CREATE TABLE IF NOT EXISTS recurring_invoice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  customer_mobile TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  shipping_charges NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'flat',
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  gst_type TEXT NOT NULL DEFAULT 'none',
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  terms TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT 'monthly',
  next_run_date DATE NOT NULL,
  end_type TEXT NOT NULL DEFAULT 'never',
  end_date DATE,
  end_after_count INT,
  occurrences_generated INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recurring_invoice_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON recurring_invoice_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
