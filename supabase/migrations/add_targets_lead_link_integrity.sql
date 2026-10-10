-- Targets: keep a lead's link to its order / invoice honest.
--
-- leads.order_id and leads.invoice_id were plain columns, so deleting the order or invoice left the lead
-- pointing at nothing: its "View the order" link was dead, the lead could not be deleted or re-linked, and
-- it stayed "Won" for a sale that no longer existed. These foreign keys clear the link automatically when
-- the order or invoice is deleted. Safe to run more than once.

-- 1. Clear links that are already dangling (a foreign key cannot be added while any exist).
UPDATE leads SET order_id = NULL
WHERE order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = leads.order_id);

UPDATE leads SET invoice_id = NULL
WHERE invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sales_invoices i WHERE i.id = leads.invoice_id);

-- 2. The keys. ON UPDATE CASCADE lets a changed order number carry the lead's link with it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_order_id_fkey') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders (id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_invoice_id_fkey') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES sales_invoices (id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Deleting an order or invoice looks the lead up by these columns.
CREATE INDEX IF NOT EXISTS idx_leads_order_id ON leads (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_invoice_id ON leads (invoice_id) WHERE invoice_id IS NOT NULL;
