-- Extends get_customer_order_status (add_customer_order_status_link.sql) with two more
-- customer-safe fields for the public /track/[token] page: total product-sales balance due
-- (same total-minus-credits-minus-payments logic already used everywhere else — see
-- src/lib/sales.ts deriveInvoiceBalance / combined-reports.ts's own sales-revenue filter) and
-- the shop's logo, so the page can show a combined "Product Sale + Stitching Orders = Total"
-- dues figure and the shop's own branding. No new tables, no new trust boundary: still the same
-- one SECURITY DEFINER function, still scoped to the one customer addressed by share_token.
CREATE OR REPLACE FUNCTION get_customer_order_status(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer customers%ROWTYPE;
  v_orders jsonb;
  v_shop jsonb;
  v_sales_due numeric;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE share_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(o ORDER BY o.created_at DESC), '[]'::jsonb) INTO v_orders
  FROM (
    SELECT
      ord.id,
      ord.delivery_date AS "deliveryDate",
      ord.total,
      ord.advance,
      (ord.total - ord.advance) AS balance,
      ord.status,
      ord.special,
      COALESCE(ord.history, '{}') AS history,
      COALESCE(ord.images, '{}') AS images,
      ord.rework_flag AS "reworkFlag",
      ord.rework_reason AS "reworkReason",
      ord.created_at,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'type', g->>'type',
          'no', (g->>'no')::int,
          'amount', (g->>'amount')::numeric
        )), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(ord.garments, '[]'::jsonb)) AS g
      ) AS garments
    FROM orders ord
    WHERE ord.mobile = v_customer.mobile
  ) o;

  -- Same balance definition as deriveInvoiceBalance: total - credits - payments, floored at 0
  -- per invoice, drafts excluded (a draft was never issued to the customer, so it isn't a
  -- real due yet — mirrors combined-reports.ts's own sales-revenue filter).
  SELECT COALESCE(SUM(GREATEST(0, GREATEST(0, si.total - COALESCE(credits.total, 0)) - COALESCE(pay.total, 0))), 0)
  INTO v_sales_due
  FROM sales_invoices si
  LEFT JOIN (SELECT invoice_id, SUM(total) AS total FROM sales_credit_notes GROUP BY invoice_id) credits ON credits.invoice_id = si.id
  LEFT JOIN (SELECT invoice_id, SUM(amount) AS total FROM sales_payments GROUP BY invoice_id) pay ON pay.invoice_id = si.id
  WHERE si.customer_mobile = v_customer.mobile
    AND si.doc_status <> 'draft';

  SELECT value INTO v_shop FROM app_settings WHERE key = 'shop';

  RETURN jsonb_build_object(
    'customerName', v_customer.name,
    'loyaltyPoints', COALESCE(v_customer.loyalty_points, 0),
    'measurements', COALESCE(v_customer.measurements, '{}'::jsonb),
    'orders', v_orders,
    'shopName', COALESCE(v_shop->>'name', ''),
    'shopPhone', COALESCE(v_shop->>'phone', ''),
    'shopLogoDataUrl', v_shop->>'logoDataUrl',
    'salesDue', v_sales_due
  );
END;
$$;
