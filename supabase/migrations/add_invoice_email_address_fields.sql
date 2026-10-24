-- Extend the public invoice share-link RPC to also expose the shop's email (free-form JSON in
-- app_settings.shop, no schema change needed there — see ShopConfig in
-- src/hooks/use-shop-settings.ts) and the customer's address/email (already real columns on
-- customers, just not selected by this function before) — additive only, existing callers of
-- get_public_invoice keep working unchanged.
CREATE OR REPLACE FUNCTION get_public_invoice(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice sales_invoices%ROWTYPE;
  v_paid numeric;
  v_credits numeric;
  v_shop jsonb;
  v_templates jsonb;
  v_customer_gstin text;
  v_customer_address text;
  v_customer_email text;
BEGIN
  SELECT * INTO v_invoice FROM sales_invoices WHERE share_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sales_payments WHERE invoice_id = v_invoice.id;
  SELECT COALESCE(SUM(total), 0) INTO v_credits FROM sales_credit_notes WHERE invoice_id = v_invoice.id;
  SELECT value INTO v_shop FROM app_settings WHERE key = 'shop';
  SELECT value INTO v_templates FROM app_settings WHERE key = 'invoiceTemplates';
  SELECT gstin, address, email INTO v_customer_gstin, v_customer_address, v_customer_email
    FROM customers WHERE mobile = v_invoice.customer_mobile LIMIT 1;

  IF v_invoice.doc_status IN ('draft', 'sent') THEN
    UPDATE sales_invoices SET doc_status = 'viewed', viewed_at = COALESCE(viewed_at, now())
      WHERE id = v_invoice.id
      RETURNING doc_status, viewed_at INTO v_invoice.doc_status, v_invoice.viewed_at;
  END IF;

  RETURN jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'paidTotal', v_paid,
    'creditsTotal', v_credits,
    'shopName', COALESCE(v_shop->>'name', ''),
    'shopPhone', COALESCE(v_shop->>'phone', ''),
    'shopAddress', COALESCE(v_shop->>'address', ''),
    'shopGstin', COALESCE(v_shop->>'gstin', ''),
    'shopEmail', COALESCE(v_shop->>'email', ''),
    'customerGstin', COALESCE(v_customer_gstin, ''),
    'customerAddress', COALESCE(v_customer_address, ''),
    'customerEmail', COALESCE(v_customer_email, ''),
    'invoiceTemplates', v_templates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_invoice(uuid) TO anon, authenticated;
