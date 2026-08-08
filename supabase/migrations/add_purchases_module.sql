-- Run this once in your Supabase SQL editor
-- Phase 2: Purchases — Vendors, Purchase Orders, Bills, Vendor Payments, Vendor Credits.
-- Line items are stored as JSONB (same pattern as orders.garments) — each line item is
-- {raw_material_id, raw_material_name, unit_name, qty, unit_cost, amount}. Names/units are
-- snapshotted at save time so a later rename/deletion of a raw material doesn't corrupt history.

CREATE TABLE IF NOT EXISTS vendors (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  mobile     TEXT        NOT NULL DEFAULT '',
  email      TEXT        NOT NULL DEFAULT '',
  gstin      TEXT        NOT NULL DEFAULT '',
  state      TEXT        NOT NULL DEFAULT '',
  address    TEXT        NOT NULL DEFAULT '',
  notes      TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id         UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  po_number  TEXT          NOT NULL UNIQUE,
  vendor_id  UUID          NOT NULL REFERENCES vendors(id),
  date       DATE          NOT NULL DEFAULT CURRENT_DATE,
  status     TEXT          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
  items      JSONB         NOT NULL DEFAULT '[]',
  total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes      TEXT          NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ   DEFAULT NOW(),
  updated_at TIMESTAMPTZ   DEFAULT NOW()
);

-- Creating a bill is the moment stock is actually received — it writes inventory_ledger
-- rows (ref_type='purchase', ref_id=bill id) in the same mutation. A bill may optionally
-- reference the purchase order it fulfils.
CREATE TABLE IF NOT EXISTS purchase_bills (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_number TEXT          NOT NULL UNIQUE,
  vendor_id   UUID          NOT NULL REFERENCES vendors(id),
  po_id       UUID          REFERENCES purchase_orders(id),
  bill_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date    DATE,
  items       JSONB         NOT NULL DEFAULT '[]',
  taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_type    TEXT          NOT NULL DEFAULT 'none' CHECK (gst_type IN ('none', 'intra', 'inter')),
  tax_rate    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cgst        NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst        NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes       TEXT          NOT NULL DEFAULT '',
  created_by  TEXT,
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   DEFAULT NOW()
);

-- Append-only. A bill's amount paid is always SUM(vendor_payments.amount) for that bill —
-- never a stored/cached column — same rule as order balances and inventory stock.
CREATE TABLE IF NOT EXISTS vendor_payments (
  id         UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id    UUID          NOT NULL REFERENCES purchase_bills(id),
  vendor_id  UUID          NOT NULL REFERENCES vendors(id),
  amount     NUMERIC(12,2) NOT NULL,
  method     TEXT          NOT NULL DEFAULT 'Cash',
  date       DATE          NOT NULL DEFAULT CURRENT_DATE,
  note       TEXT          NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ   DEFAULT NOW()
);

-- A return against a received bill. Reduces raw material stock (ref_type='purchase_return')
-- and reduces the amount owed to the vendor for that bill.
CREATE TABLE IF NOT EXISTS vendor_credits (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_number TEXT          NOT NULL UNIQUE,
  vendor_id     UUID          NOT NULL REFERENCES vendors(id),
  bill_id       UUID          REFERENCES purchase_bills(id),
  date          DATE          NOT NULL DEFAULT CURRENT_DATE,
  items         JSONB         NOT NULL DEFAULT '[]',
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason        TEXT          NOT NULL DEFAULT '',
  notes         TEXT          NOT NULL DEFAULT '',
  created_by    TEXT,
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_vendor ON purchase_bills (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_bill ON vendor_payments (bill_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_vendor ON vendor_credits (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_bill ON vendor_credits (bill_id);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON purchase_bills FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON vendor_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON vendor_credits FOR ALL TO authenticated USING (true) WITH CHECK (true);
