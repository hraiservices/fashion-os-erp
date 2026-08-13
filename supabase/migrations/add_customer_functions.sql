-- Customer identity is keyed as 'CUST-' || mobile, so editing a customer's phone number
-- changes their primary key. The client-side upsert simply wrote a row at the NEW id,
-- silently orphaning the old row — which is where loyalty_points, total_points_earned and
-- loyalty_history live. The customer lost their entire point balance, and their existing
-- orders (still stamped with the old mobile) pointed at the abandoned record.
--
-- change_customer_mobile migrates the identity atomically: carries loyalty state across,
-- repoints every order, and removes the old row, all under a single row lock.
CREATE OR REPLACE FUNCTION change_customer_mobile(
  p_old_mobile TEXT,
  p_new_mobile TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_id TEXT;
  v_new_id TEXT;
  v_old    customers%ROWTYPE;
BEGIN
  IF p_old_mobile IS NULL OR p_new_mobile IS NULL OR p_old_mobile = p_new_mobile THEN
    RETURN FALSE;
  END IF;

  v_old_id := 'CUST-' || p_old_mobile;
  v_new_id := 'CUST-' || p_new_mobile;

  SELECT * INTO v_old FROM customers WHERE id = v_old_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Refuse to merge into an existing customer — that is a deliberate merge operation,
  -- not a rename, and silently combining two point balances would be wrong.
  IF EXISTS (SELECT 1 FROM customers WHERE id = v_new_id) THEN
    RAISE EXCEPTION 'MOBILE_TAKEN: another customer already uses %', p_new_mobile;
  END IF;

  INSERT INTO customers (
    id, name, mobile, email, dob, anniversary, address, notes,
    payment_terms, price_list_id, gstin, measurements, tags,
    loyalty_points, total_points_earned, loyalty_history
  ) VALUES (
    v_new_id, v_old.name, p_new_mobile, v_old.email, v_old.dob, v_old.anniversary,
    v_old.address, v_old.notes, v_old.payment_terms, v_old.price_list_id, v_old.gstin,
    v_old.measurements, v_old.tags,
    COALESCE(v_old.loyalty_points, 0),
    COALESCE(v_old.total_points_earned, 0),
    COALESCE(v_old.loyalty_history, '[]'::jsonb)
  );

  UPDATE orders SET mobile = p_new_mobile WHERE mobile = p_old_mobile;

  DELETE FROM customers WHERE id = v_old_id;

  RETURN TRUE;
END;
$$;


-- Deletes a customer and their order history, but refuses when any order is a settled
-- financial record (delivered or paid) or still carries an outstanding balance.
-- Returns the number of orders removed.
CREATE OR REPLACE FUNCTION delete_customer_cascade(
  p_mobile TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_blocked INTEGER;
  v_owed    INTEGER;
  v_count   INTEGER;
BEGIN
  IF p_mobile IS NULL OR p_mobile = '' THEN
    RAISE EXCEPTION 'Mobile is required';
  END IF;

  SELECT COUNT(*) INTO v_blocked
  FROM orders WHERE mobile = p_mobile AND status IN ('delivered', 'payment');

  IF v_blocked > 0 THEN
    RAISE EXCEPTION 'HAS_SETTLED_ORDERS: % delivered/paid order(s) exist — these are accounting records and cannot be deleted', v_blocked;
  END IF;

  SELECT COALESCE(SUM(balance), 0) INTO v_owed
  FROM orders WHERE mobile = p_mobile;

  IF v_owed > 0 THEN
    RAISE EXCEPTION 'HAS_OUTSTANDING_BALANCE: ₹% is still due — settle or write off before deleting', v_owed;
  END IF;

  DELETE FROM orders WHERE mobile = p_mobile;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM customers WHERE id = 'CUST-' || p_mobile;

  RETURN v_count;
END;
$$;
