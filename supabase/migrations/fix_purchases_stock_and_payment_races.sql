-- Two gaps found in the forensic audit of the Purchases/Inventory module.

-- 1) guard_stock_not_negative only watches ref_type IN ('sale','work_order_consume',
--    'transfer_out') — 'purchase_return' (a vendor credit's stock reversal) was never covered,
--    so raising a vendor credit for more quantity than is actually in stock (a typo, or a
--    credit raised against the wrong item) drives stock arbitrarily negative with no guard at
--    all, unlike every other outbound movement type.
CREATE OR REPLACE FUNCTION guard_stock_not_negative()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  current_stock NUMERIC;
BEGIN
  IF NEW.movement < 0 AND NEW.ref_type IN ('sale', 'work_order_consume', 'transfer_out', 'purchase_return') THEN
    SELECT COALESCE(SUM(movement), 0) INTO current_stock
    FROM inventory_ledger
    WHERE item_type = NEW.item_type AND item_id = NEW.item_id;

    IF current_stock + NEW.movement < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for % % (current: %, requested: %)',
        NEW.item_type, NEW.item_id, current_stock, ABS(NEW.movement)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Vendor payment overpayment guard (src/app/api/purchases/payments/route.ts) was a plain
--    read-then-insert with no row lock — two near-simultaneous payments against the same bill
--    could both read the same "balance so far", both pass the check, and together overpay the
--    bill with no DB constraint to catch it. record_order_payment already uses this exact
--    SELECT ... FOR UPDATE pattern for stitching-order payments; mirrored here for vendor bills.
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
  VALUES (p_bill_id, p_vendor_id, p_amount, p_method, p_date, p_note, p_created_by)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;
