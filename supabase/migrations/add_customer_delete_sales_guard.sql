-- delete_customer_cascade previously only checked/deleted stitching orders — sales_invoices,
-- sales_payments, and sales_credit_notes key off customer_mobile with no foreign key to
-- customers at all, so deleting a customer silently orphaned every retail invoice they ever
-- had, including unpaid ones (the outstanding-balance guard only ever looked at orders).
-- Same guard philosophy as the existing order checks: an issued (non-draft) invoice is an
-- accounting record and cannot be deleted, and any outstanding balance (across orders AND
-- invoices) blocks the whole customer deletion.
CREATE OR REPLACE FUNCTION delete_customer_cascade(
  p_mobile TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_blocked        INTEGER;
  v_owed           INTEGER;
  v_invoices_owed  NUMERIC;
  v_issued_invoices INTEGER;
  v_count          INTEGER;
BEGIN
  IF p_mobile IS NULL OR p_mobile = '' THEN
    RAISE EXCEPTION 'Mobile is required';
  END IF;

  SELECT COUNT(*) INTO v_blocked
  FROM orders WHERE mobile = p_mobile AND status IN ('delivered', 'payment');

  IF v_blocked > 0 THEN
    RAISE EXCEPTION 'HAS_SETTLED_ORDERS: % delivered/paid order(s) exist — these are accounting records and cannot be deleted', v_blocked;
  END IF;

  -- Any invoice that has actually been issued (not a draft) is an accounting record, same
  -- rule as delivered/paid stitching orders above.
  SELECT COUNT(*) INTO v_issued_invoices
  FROM sales_invoices WHERE customer_mobile = p_mobile AND doc_status <> 'draft';

  IF v_issued_invoices > 0 THEN
    RAISE EXCEPTION 'HAS_ISSUED_INVOICES: % invoice(s) have been issued to this customer — these are accounting records and cannot be deleted', v_issued_invoices;
  END IF;

  SELECT COALESCE(SUM(balance), 0) INTO v_owed
  FROM orders WHERE mobile = p_mobile;

  IF v_owed > 0 THEN
    RAISE EXCEPTION 'HAS_OUTSTANDING_BALANCE: ₹% is still due on stitching orders — settle or write off before deleting', v_owed;
  END IF;

  -- total − credits − payments, same derivation as deriveInvoiceBalance (src/lib/sales.ts) so
  -- this agrees with what the app itself would show as "outstanding" for these invoices.
  SELECT COALESCE(SUM(
    GREATEST(0, i.total - COALESCE(c.credited, 0)) - COALESCE(p.paid, 0)
  ), 0) INTO v_invoices_owed
  FROM sales_invoices i
  LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid FROM sales_payments GROUP BY invoice_id) p ON p.invoice_id = i.id
  LEFT JOIN (SELECT invoice_id, SUM(total) AS credited FROM sales_credit_notes GROUP BY invoice_id) c ON c.invoice_id = i.id
  WHERE i.customer_mobile = p_mobile;

  IF v_invoices_owed > 0 THEN
    RAISE EXCEPTION 'HAS_OUTSTANDING_BALANCE: ₹% is still due on sales invoices — settle or write off before deleting', v_invoices_owed;
  END IF;

  -- Only draft invoices (never issued) survive to this point — safe to remove along with
  -- their (necessarily empty, since payments/credits can't exist without an amount owed
  -- already ruled out above) related rows.
  DELETE FROM sales_payments WHERE invoice_id IN (SELECT id FROM sales_invoices WHERE customer_mobile = p_mobile);
  DELETE FROM sales_credit_notes WHERE invoice_id IN (SELECT id FROM sales_invoices WHERE customer_mobile = p_mobile);
  DELETE FROM sales_invoices WHERE customer_mobile = p_mobile;

  DELETE FROM orders WHERE mobile = p_mobile;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM customers WHERE id = 'CUST-' || p_mobile;

  RETURN v_count;
END;
$$;
