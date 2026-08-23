-- Referral coupons — a shop staff member issues one to a happy customer from their CRM page,
-- prints it (Code128 barcode of the code), and the recipient redeems it for a flat discount on
-- a future order. Redeeming credits a loyalty-point bonus back to the referrer.

CREATE TABLE IF NOT EXISTS referral_coupons (
  id                UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  code              TEXT          NOT NULL UNIQUE,
  referrer_mobile   TEXT          NOT NULL,
  referrer_name     TEXT          NOT NULL DEFAULT '',
  discount_amount   NUMERIC(10,2) NOT NULL DEFAULT 100,
  issued_at         TIMESTAMPTZ   DEFAULT NOW(),
  expires_at        TIMESTAMPTZ   NOT NULL,
  redeemed_at       TIMESTAMPTZ,
  -- Deliberately NOT a foreign key: redemption is reserved BEFORE the order row is inserted
  -- (same reason reserve_loyalty_discount reserves points before the order exists — the
  -- discount amount must be known to compute the order's advance/balance at insert time), so
  -- an FK checked immediately would fail on an order id that doesn't exist yet. Same
  -- unenforced-reference convention already used for orderId inside customers.loyalty_history.
  redeemed_order_id TEXT,
  created_by        TEXT
);

ALTER TABLE referral_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON referral_coupons FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Atomically reserves a coupon at order-creation time — locks by code, checks not already
-- redeemed and not expired, marks it redeemed. Mirrors reserve_loyalty_discount's shape
-- (add_order_edit_function.sql) so a concurrent order can't double-spend the same coupon.
CREATE OR REPLACE FUNCTION redeem_referral_coupon(
  p_code     TEXT,
  p_order_id TEXT
) RETURNS SETOF referral_coupons
LANGUAGE plpgsql
AS $$
DECLARE
  v_row referral_coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM referral_coupons WHERE code = p_code FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUPON_NOT_FOUND';
  END IF;
  IF v_row.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION 'COUPON_ALREADY_REDEEMED';
  END IF;
  IF v_row.expires_at < NOW() THEN
    RAISE EXCEPTION 'COUPON_EXPIRED';
  END IF;

  RETURN QUERY
  UPDATE referral_coupons
  SET redeemed_at = NOW(), redeemed_order_id = p_order_id
  WHERE code = p_code
  RETURNING *;
END;
$$;

-- Compensating release when the order insert that reserved a coupon fails — mirrors
-- refund_loyalty_discount's role in the same failure path in src/app/api/orders/route.ts.
CREATE OR REPLACE FUNCTION release_referral_coupon(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE referral_coupons SET redeemed_at = NULL, redeemed_order_id = NULL WHERE code = p_code;
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_referral_coupon(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION release_referral_coupon(TEXT) TO authenticated;
