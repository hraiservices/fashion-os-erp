-- Run this once in your Supabase SQL editor.
--
-- Forensic pre-launch audit found: unlike stitching-order payments and vendor bill payments
-- (record_order_payment / record_vendor_payment, both SELECT ... FOR UPDATE inside a single
-- RPC), sales invoice payments and credit notes were a plain read-then-insert in application
-- code with no row lock. Two near-simultaneous submissions against the same invoice (a
-- double-tap, a retried request) could both read the same "balance so far", both pass the
-- overpayment/over-credit check, and together overpay the invoice or issue more credit than it's
-- worth — a credit-note race additionally double-restocks the same returned inventory. These two
-- RPCs close both gaps the same way the purchases-side ones already were fixed.

CREATE OR REPLACE FUNCTION record_sales_payment(
  p_invoice_id      UUID,
  p_customer_mobile TEXT,
  p_amount          NUMERIC,
  p_method          TEXT,
  p_date            TEXT,
  p_note            TEXT,
  p_pos_session_id  UUID,
  p_created_by      TEXT
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_total NUMERIC;
  v_paid NUMERIC;
  v_credited NUMERIC;
  v_balance NUMERIC;
  v_payment_id UUID;
BEGIN
  SELECT total INTO v_total FROM sales_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sales_payments WHERE invoice_id = p_invoice_id;
  SELECT COALESCE(SUM(total), 0) INTO v_credited FROM sales_credit_notes WHERE invoice_id = p_invoice_id;
  v_balance := v_total - v_paid - v_credited;

  IF p_amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'Payment of %s exceeds the outstanding balance of %s', p_amount, v_balance;
  END IF;

  INSERT INTO sales_payments (invoice_id, customer_mobile, amount, method, date, note, pos_session_id, created_by)
  VALUES (p_invoice_id, p_customer_mobile, p_amount, p_method, p_date, p_note, p_pos_session_id, p_created_by)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION record_sales_credit_note(
  p_invoice_id      UUID,
  p_invoice_number  TEXT,
  p_credit_number   TEXT,
  p_customer_mobile TEXT,
  p_date            TEXT,
  p_items           JSONB,
  p_total           NUMERIC,
  p_reason          TEXT,
  p_notes           TEXT,
  p_created_by      TEXT
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_total NUMERIC;
  v_invoice_items JSONB;
  v_credited_so_far NUMERIC;
  v_max_allowed NUMERIC;
  v_credit_id UUID;
  v_item JSONB;
  v_product_id TEXT;
  v_qty NUMERIC;
  v_invoiced_qty NUMERIC;
  v_already_credited_qty NUMERIC;
BEGIN
  -- Locks the invoice row for the rest of this transaction — a concurrent call for the SAME
  -- invoice blocks here until this one commits or rolls back, which is what actually closes
  -- the race (the aggregate/per-line checks below are only safe because of this lock).
  SELECT total, items INTO v_invoice_total, v_invoice_items
  FROM sales_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_credited_so_far FROM sales_credit_notes WHERE invoice_id = p_invoice_id;
  v_max_allowed := v_invoice_total - v_credited_so_far;

  IF p_total > v_max_allowed + 0.01 THEN
    RAISE EXCEPTION 'Credit note of %s exceeds the creditable balance of %s (invoice %s minus %s already credited)', p_total, v_max_allowed, v_invoice_total, v_credited_so_far;
  END IF;

  -- Per-product quantity cap: a returned line can't exceed (qty actually invoiced for that
  -- product) minus (qty already credited for it across all prior credit notes on this invoice).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := v_item->>'productId';
    IF v_product_id IS NULL THEN CONTINUE; END IF;
    v_qty := COALESCE((v_item->>'qty')::numeric, 0);

    SELECT COALESCE(SUM((i->>'qty')::numeric), 0) INTO v_invoiced_qty
    FROM jsonb_array_elements(COALESCE(v_invoice_items, '[]'::jsonb)) i
    WHERE i->>'productId' = v_product_id;

    SELECT COALESCE(SUM((ci->>'qty')::numeric), 0) INTO v_already_credited_qty
    FROM sales_credit_notes cn, jsonb_array_elements(cn.items) ci
    WHERE cn.invoice_id = p_invoice_id AND ci->>'productId' = v_product_id;

    IF v_qty > (v_invoiced_qty - v_already_credited_qty) + 0.001 THEN
      RAISE EXCEPTION 'Cannot return %s of product %s — only %s remain un-returned', v_qty, v_product_id, GREATEST(0, v_invoiced_qty - v_already_credited_qty);
    END IF;
  END LOOP;

  INSERT INTO sales_credit_notes (credit_number, invoice_id, customer_mobile, date, items, total, reason, notes, created_by)
  VALUES (p_credit_number, p_invoice_id, p_customer_mobile, p_date, p_items, p_total, p_reason, p_notes, p_created_by)
  RETURNING id INTO v_credit_id;

  -- Restock the returned quantities in the same transaction as the credit note itself — no
  -- more separate compensating-delete-on-failure needed, this either all commits or all rolls
  -- back together.
  INSERT INTO inventory_ledger (item_type, item_id, movement, ref_type, ref_id, note, created_by)
  SELECT 'product', (i->>'productId')::uuid, COALESCE((i->>'qty')::numeric, 0), 'sale_return', v_credit_id,
         'Return against invoice ' || p_invoice_number, p_created_by
  FROM jsonb_array_elements(p_items) i
  WHERE i->>'productId' IS NOT NULL AND COALESCE((i->>'qty')::numeric, 0) > 0;

  RETURN v_credit_id;
END;
$$;
