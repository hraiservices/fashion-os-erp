-- Customer-facing statement link — reuses the existing customers.share_token (already added by
-- add_customer_order_status_link.sql; one customer-wide token covers both the order-status link
-- and this statement link, no new column needed). Same architecture: a single narrow
-- SECURITY DEFINER RPC returning only customer-safe fields, keyed by share_token.

-- Replicates buildCustomerTransactions()'s document-level rows (src/lib/customer-ledger.ts) and
-- the balance rules in src/lib/balances.ts / src/lib/sales.ts:deriveInvoiceBalance — orders'
-- balance is (total - advance); invoices' balance is total minus credit notes minus payments,
-- floored at 0 at each step. Keep this in sync with those functions if either changes.
CREATE OR REPLACE FUNCTION get_customer_statement(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer customers%ROWTYPE;
  v_orders jsonb;
  v_invoices jsonb;
  v_shop jsonb;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE share_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(o ORDER BY o.in_date), '[]'::jsonb) INTO v_orders
  FROM (
    SELECT
      ord.id,
      ord.in_date AS "inDate",
      ord.total,
      (ord.total - ord.advance) AS balance,
      (
        SELECT COALESCE(string_agg(g->>'type', ', '), 'Stitching order')
        FROM jsonb_array_elements(COALESCE(ord.garments, '[]'::jsonb)) AS g
      ) AS description
    FROM orders ord
    WHERE ord.mobile = v_customer.mobile
  ) o;

  SELECT COALESCE(jsonb_agg(i ORDER BY i.invoice_date), '[]'::jsonb) INTO v_invoices
  FROM (
    SELECT
      inv.id,
      inv.invoice_number AS "invoiceNumber",
      inv.invoice_date AS "invoiceDate",
      inv.subject,
      inv.total,
      GREATEST(
        0,
        GREATEST(0, inv.total - COALESCE((SELECT SUM(scn.total) FROM sales_credit_notes scn WHERE scn.invoice_id = inv.id), 0))
        - COALESCE((SELECT SUM(sp.amount) FROM sales_payments sp WHERE sp.invoice_id = inv.id), 0)
      ) AS balance,
      COALESCE((SELECT SUM(sp.amount) FROM sales_payments sp WHERE sp.invoice_id = inv.id), 0) AS "paidTotal"
    FROM sales_invoices inv
    WHERE inv.customer_mobile = v_customer.mobile
  ) i;

  SELECT value INTO v_shop FROM app_settings WHERE key = 'shop';

  RETURN jsonb_build_object(
    'customerName', v_customer.name,
    'customerMobile', v_customer.mobile,
    'orders', v_orders,
    'invoices', v_invoices,
    'shopName', COALESCE(v_shop->>'name', ''),
    'shopPhone', COALESCE(v_shop->>'phone', ''),
    'shopLogoDataUrl', v_shop->>'logoDataUrl'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_statement(uuid) TO anon, authenticated;
