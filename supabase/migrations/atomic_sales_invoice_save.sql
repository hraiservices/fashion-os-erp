-- Fixes two real data-integrity bugs found in a forensic audit:
--
-- 1. (P0) Sales invoice creation did THREE independent round-trips from the Next.js route —
--    upsert sales_invoices, then a separate replace_inventory_ledger RPC call, then a separate
--    sales_quotations status update — with no transaction wrapping all three. If the ledger
--    call failed after the invoice upsert committed, the invoice existed with a real total/GST
--    amount but zero stock movement, permanently overstating inventory for every item sold on
--    it. This migration moves all three writes into one plpgsql function so they commit or
--    fail together.
--
-- 2. (P1) Converting a quotation to an invoice had only an app-level SELECT-then-INSERT check
--    (see route.ts) — a real TOCTOU gap: two near-simultaneous "Convert to Invoice" clicks for
--    the same quote could both pass the SELECT before either INSERT committed, creating two
--    invoices and double-decrementing stock. A partial unique index closes this at the only
--    place that can actually enforce it — the database — and the save function below lets a
--    unique-violation surface as a clean, catchable error instead of a raw constraint error.
--
-- Also used by POS checkout (see api/sales/invoices/route.ts), which additionally passes
-- p_payments so a POS sale's invoice + ledger + payment rows are all one atomic write instead
-- of the invoice committing separately from the payment (the other P0 this audit found).

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoices_quote_unique
  ON sales_invoices (quote_id) WHERE quote_id IS NOT NULL;

CREATE OR REPLACE FUNCTION save_sales_invoice(
  p_id UUID,
  p_invoice_number TEXT,
  p_customer_mobile TEXT,
  p_customer_name TEXT,
  p_quote_id UUID,
  p_invoice_date DATE,
  p_due_date DATE,
  p_items JSONB,
  p_subject TEXT,
  p_shipping_charges NUMERIC,
  p_discount_type TEXT,
  p_discount_value NUMERIC,
  p_taxable_amount NUMERIC,
  p_gst_type TEXT,
  p_tax_rate NUMERIC,
  p_cgst NUMERIC,
  p_sgst NUMERIC,
  p_igst NUMERIC,
  p_round_off NUMERIC,
  p_total NUMERIC,
  p_doc_status TEXT,
  p_terms TEXT,
  p_notes TEXT,
  p_created_by TEXT,
  p_ledger_rows JSONB,           -- NULL to skip inventory effect entirely (backdated/imported invoices)
  p_mark_quote_accepted BOOLEAN,
  p_payments JSONB               -- NULL/empty for the normal invoice-form flow; POS passes initial tenders here
) RETURNS sales_invoices
LANGUAGE plpgsql
AS $$
DECLARE
  v_row sales_invoices;
BEGIN
  IF p_id IS NULL THEN
    BEGIN
      INSERT INTO sales_invoices (
        invoice_number, customer_mobile, customer_name, quote_id, invoice_date, due_date, items,
        subject, shipping_charges, discount_type, discount_value, taxable_amount, gst_type, tax_rate,
        cgst, sgst, igst, round_off, total, doc_status, terms, notes, created_by
      ) VALUES (
        p_invoice_number, p_customer_mobile, p_customer_name, p_quote_id, p_invoice_date, p_due_date, p_items,
        p_subject, p_shipping_charges, p_discount_type, p_discount_value, p_taxable_amount, p_gst_type, p_tax_rate,
        p_cgst, p_sgst, p_igst, p_round_off, p_total, p_doc_status, p_terms, p_notes, p_created_by
      ) RETURNING * INTO v_row;
    EXCEPTION WHEN unique_violation THEN
      -- Raised specifically for the idx_sales_invoices_quote_unique race — the route catches
      -- this by SQLSTATE and turns it into the same friendly "already converted" message the
      -- old (non-atomic) app-level check gave, just now actually race-proof.
      RAISE EXCEPTION 'This quotation was already converted to an invoice.' USING ERRCODE = '23505';
    END;
  ELSE
    UPDATE sales_invoices SET
      invoice_number = p_invoice_number,
      customer_mobile = p_customer_mobile,
      customer_name = p_customer_name,
      quote_id = p_quote_id,
      invoice_date = p_invoice_date,
      due_date = p_due_date,
      items = p_items,
      subject = p_subject,
      shipping_charges = p_shipping_charges,
      discount_type = p_discount_type,
      discount_value = p_discount_value,
      taxable_amount = p_taxable_amount,
      gst_type = p_gst_type,
      tax_rate = p_tax_rate,
      cgst = p_cgst,
      sgst = p_sgst,
      igst = p_igst,
      round_off = p_round_off,
      total = p_total,
      doc_status = p_doc_status,
      terms = p_terms,
      notes = p_notes,
      updated_at = NOW()
    WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;

  IF p_ledger_rows IS NOT NULL THEN
    DELETE FROM inventory_ledger WHERE ref_type = 'sale' AND ref_id = v_row.id::text;
    INSERT INTO inventory_ledger (item_type, item_id, movement, ref_type, ref_id, note, created_by)
    SELECT x.item_type, x.item_id, x.movement, 'sale', v_row.id::text, COALESCE(x.note, ''), x.created_by
    FROM jsonb_to_recordset(p_ledger_rows) AS x(
      item_type TEXT, item_id UUID, movement NUMERIC(12,3), note TEXT, created_by TEXT
    );
  END IF;

  IF p_mark_quote_accepted AND p_quote_id IS NOT NULL THEN
    UPDATE sales_quotations SET status = 'accepted' WHERE id = p_quote_id;
  END IF;

  IF p_payments IS NOT NULL THEN
    INSERT INTO sales_payments (invoice_id, customer_mobile, amount, method, date, note, created_by, pos_session_id)
    SELECT v_row.id, p_customer_mobile, x.amount, x.method, x.date, COALESCE(x.note, ''), x.created_by, x.pos_session_id
    FROM jsonb_to_recordset(p_payments) AS x(
      amount NUMERIC(12,2), method TEXT, date DATE, note TEXT, created_by TEXT, pos_session_id UUID
    );
  END IF;

  RETURN v_row;
END;
$$;
