-- Customer GSTIN (company GSTIN/address already live in app_settings.shop as free-form JSON,
-- no migration needed there — see ShopConfig in src/hooks/use-shop-settings.ts).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gstin TEXT NOT NULL DEFAULT '';

-- Extend the public invoice share-link RPC to also expose company address/GSTIN and the
-- customer's GSTIN (looked up by mobile, matching how customer data is joined elsewhere in
-- this app) — additive only, existing callers of get_public_invoice keep working unchanged.
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
BEGIN
  SELECT * INTO v_invoice FROM sales_invoices WHERE share_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sales_payments WHERE invoice_id = v_invoice.id;
  SELECT COALESCE(SUM(total), 0) INTO v_credits FROM sales_credit_notes WHERE invoice_id = v_invoice.id;
  SELECT value INTO v_shop FROM app_settings WHERE key = 'shop';
  SELECT value INTO v_templates FROM app_settings WHERE key = 'invoiceTemplates';
  SELECT gstin INTO v_customer_gstin FROM customers WHERE mobile = v_invoice.customer_mobile LIMIT 1;

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
    'customerGstin', COALESCE(v_customer_gstin, ''),
    'invoiceTemplates', v_templates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_invoice(uuid) TO anon, authenticated;
