-- Extends get_customer_order_status (add_customer_order_status_dues_and_logo.sql) with the
-- customer's loyalty-point redemption eligibility, so the public /track/[token] page can show
-- "you have enough points for a ₹X discount" next to the points banner without ever exposing the
-- shop's full loyalty config (only the two derived numbers a customer needs). Mirrors
-- computeRedemption() in src/lib/business-rules.ts exactly — same asymmetric floor/ceil rule.
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
  v_loyalty jsonb;
  v_sales_due numeric;
  v_stitching_due numeric;
  v_min_redeem numeric;
  v_redeem_per_100 numeric;
  v_can_redeem boolean;
  v_max_pt_discount numeric;
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

  SELECT COALESCE(SUM(GREATEST(0, o.total - o.advance)), 0) INTO v_stitching_due
  FROM orders o WHERE o.mobile = v_customer.mobile;

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
  SELECT value INTO v_loyalty FROM app_settings WHERE key = 'loyalty';

  v_min_redeem := COALESCE((v_loyalty->>'minRedeem')::numeric, 100);
  v_redeem_per_100 := COALESCE((v_loyalty->>'redeemPer100pts')::numeric, 10);
  v_can_redeem := COALESCE(v_customer.loyalty_points, 0) >= v_min_redeem;
  v_max_pt_discount := CASE WHEN v_can_redeem
    THEN LEAST(FLOOR(COALESCE(v_customer.loyalty_points, 0) / 100) * v_redeem_per_100, v_sales_due + v_stitching_due)
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'customerName', v_customer.name,
    'loyaltyPoints', COALESCE(v_customer.loyalty_points, 0),
    'measurements', COALESCE(v_customer.measurements, '{}'::jsonb),
    'orders', v_orders,
    'shopName', COALESCE(v_shop->>'name', ''),
    'shopPhone', COALESCE(v_shop->>'phone', ''),
    'shopLogoDataUrl', v_shop->>'logoDataUrl',
    'salesDue', v_sales_due,
    'canRedeemPoints', v_can_redeem,
    'maxPointsDiscount', v_max_pt_discount
  );
END;
$$;
