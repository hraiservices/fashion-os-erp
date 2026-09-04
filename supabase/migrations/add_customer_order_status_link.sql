-- Customer-facing order status link — one token per customer, covering all their orders.
-- Sent as a plain URL inside the existing "order received" WhatsApp message (no template/
-- button changes needed). Same architecture as add_invoice_share_link.sql: a random
-- share_token + a single narrow SECURITY DEFINER RPC that returns only customer-safe fields.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS share_token uuid DEFAULT gen_random_uuid();
UPDATE customers SET share_token = gen_random_uuid() WHERE share_token IS NULL;
ALTER TABLE customers ALTER COLUMN share_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_share_token_idx ON customers (share_token);

-- Single, narrow, security-definer entry point for the public order-status link. Bypasses RLS
-- but only ever exposes customer-safe fields for the one customer addressed by share_token:
-- no tailor assignments, no payableAmount, no internal cost fields, no other customers' data.
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

  SELECT value INTO v_shop FROM app_settings WHERE key = 'shop';

  RETURN jsonb_build_object(
    'customerName', v_customer.name,
    'loyaltyPoints', COALESCE(v_customer.loyalty_points, 0),
    'measurements', COALESCE(v_customer.measurements, '{}'::jsonb),
    'orders', v_orders,
    'shopName', COALESCE(v_shop->>'name', ''),
    'shopPhone', COALESCE(v_shop->>'phone', '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_order_status(uuid) TO anon, authenticated;
