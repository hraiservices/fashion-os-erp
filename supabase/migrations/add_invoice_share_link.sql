-- Shareable public invoice link + "Viewed" status tracking.

ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS share_token uuid DEFAULT gen_random_uuid();
UPDATE sales_invoices SET share_token = gen_random_uuid() WHERE share_token IS NULL;
ALTER TABLE sales_invoices ALTER COLUMN share_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_share_token_idx ON sales_invoices (share_token);

ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_doc_status_check;
ALTER TABLE sales_invoices ADD CONSTRAINT sales_invoices_doc_status_check CHECK (doc_status IN ('draft', 'sent', 'viewed'));

-- Single, narrow, security-definer entry point for the public share link.
-- Bypasses RLS (which otherwise only allows the `authenticated` role) but only
-- ever exposes exactly the fields this read-only page needs, for one invoice at
-- a time, addressed only by its random share_token. Also flips doc_status to
-- 'viewed' the first time it's opened. No other table/RPC is granted to anon.
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
BEGIN
  SELECT * INTO v_invoice FROM sales_invoices WHERE share_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM sales_payments WHERE invoice_id = v_invoice.id;
  SELECT COALESCE(SUM(total), 0) INTO v_credits FROM sales_credit_notes WHERE invoice_id = v_invoice.id;
  SELECT value INTO v_shop FROM app_settings WHERE key = 'shop';
  SELECT value INTO v_templates FROM app_settings WHERE key = 'invoiceTemplates';

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
    'invoiceTemplates', v_templates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_invoice(uuid) TO anon, authenticated;
