-- Run this once in your Supabase SQL editor
-- Phase 4: Sales — Quotations, Invoices, Payments Received, Credit Notes.
-- Uses the SAME customers table as stitching orders/CRM (linked via customer_mobile, the
-- same convention as orders.mobile) — a customer's ledger spans both stitching and retail.
-- Items are JSONB (same pattern as purchase bill items): [{product_id, product_name, qty,
-- unit_price, amount}]. GST reuses the same intra/inter model as purchase bills.

CREATE TABLE IF NOT EXISTS sales_quotations (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_number   TEXT          NOT NULL UNIQUE,
  customer_mobile TEXT         NOT NULL,
  customer_name  TEXT          NOT NULL DEFAULT '',
  date           DATE          NOT NULL DEFAULT CURRENT_DATE,
  valid_until    DATE,
  status         TEXT          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'expired', 'cancelled')),
  items          JSONB         NOT NULL DEFAULT '[]',
  taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_type       TEXT          NOT NULL DEFAULT 'none' CHECK (gst_type IN ('none', 'intra', 'inter')),
  tax_rate       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cgst           NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst           NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes          TEXT          NOT NULL DEFAULT '',
  created_by     TEXT,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW()
);

-- Creating an invoice is the moment stock is actually sold — it writes inventory_ledger
-- rows (ref_type='sale', ref_id=invoice id) against finished-goods products, in the same
-- mutation. An invoice may optionally reference the quotation it was converted from.
CREATE TABLE IF NOT EXISTS sales_invoices (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number  TEXT          NOT NULL UNIQUE,
  customer_mobile TEXT          NOT NULL,
  customer_name   TEXT          NOT NULL DEFAULT '',
  quote_id        UUID          REFERENCES sales_quotations(id),
  invoice_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  items           JSONB         NOT NULL DEFAULT '[]',
  taxable_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_type        TEXT          NOT NULL DEFAULT 'none' CHECK (gst_type IN ('none', 'intra', 'inter')),
  tax_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cgst            NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst            NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT          NOT NULL DEFAULT '',
  created_by      TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Append-only. An invoice's amount paid is always SUM(sales_payments.amount) for that
-- invoice — never a stored/cached column — same rule as vendor bills and order balances.
CREATE TABLE IF NOT EXISTS sales_payments (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id      UUID          NOT NULL REFERENCES sales_invoices(id),
  customer_mobile TEXT          NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  method          TEXT          NOT NULL DEFAULT 'Cash',
  date            DATE          NOT NULL DEFAULT CURRENT_DATE,
  note            TEXT          NOT NULL DEFAULT '',
  created_by      TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- A return against an invoice. Restocks finished goods (ref_type='sale_return') and
-- reduces the amount owed by the customer for that invoice — always targets one specific
-- invoice, same rule as vendor credits on the purchase side.
CREATE TABLE IF NOT EXISTS sales_credit_notes (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_number   TEXT          NOT NULL UNIQUE,
  invoice_id      UUID          NOT NULL REFERENCES sales_invoices(id),
  customer_mobile TEXT          NOT NULL,
  date            DATE          NOT NULL DEFAULT CURRENT_DATE,
  items           JSONB         NOT NULL DEFAULT '[]',
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason          TEXT          NOT NULL DEFAULT '',
  notes           TEXT          NOT NULL DEFAULT '',
  created_by      TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_quotations_customer ON sales_quotations (customer_mobile);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer ON sales_invoices (customer_mobile);
CREATE INDEX IF NOT EXISTS idx_sales_payments_invoice ON sales_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_credit_notes_invoice ON sales_credit_notes (invoice_id);

ALTER TABLE sales_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON sales_quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_credit_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
