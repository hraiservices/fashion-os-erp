-- Same bug, same fix as fix_sales_payment_date_cast.sql, just never applied to the purchases
-- side: record_vendor_payment() takes the payment date as a TEXT RPC parameter and inserts it
-- straight into vendor_payments.date, a DATE column (add_purchases_module.sql). Postgres has no
-- implicit cast from a bound TEXT parameter to DATE inside a plpgsql INSERT, so every call to
-- this function failed at the INSERT with 'column "date" is of type date but expression is of
-- type text' -- recording a vendor payment was completely broken. Explicit ::DATE cast fixes it.
CREATE OR REPLACE FUNCTION record_vendor_payment(
  p_bill_id     UUID,
  p_vendor_id   UUID,
  p_amount      NUMERIC,
  p_method      TEXT,
  p_date        TEXT,
  p_note        TEXT,
  p_created_by  TEXT
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
  SELECT total INTO v_total FROM purchase_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found: %', p_bill_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM vendor_payments WHERE bill_id = p_bill_id;
  SELECT COALESCE(SUM(total), 0) INTO v_credited FROM vendor_credits WHERE bill_id = p_bill_id;
  v_balance := v_total - v_paid - v_credited;

  IF p_amount > v_balance + 0.01 THEN
    RAISE EXCEPTION 'Payment of %s exceeds the outstanding balance of %s', p_amount, v_balance;
  END IF;

  INSERT INTO vendor_payments (bill_id, vendor_id, amount, method, date, note, created_by)
  VALUES (p_bill_id, p_vendor_id, p_amount, p_method, p_date::DATE, p_note, p_created_by)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;
