-- Run this once in your Supabase SQL editor.
--
-- Forensic pre-launch audit found: guard_stock_not_negative() reads the current SUM(movement)
-- and compares it against the incoming movement, but with no lock — two concurrent outbound
-- movements for the SAME item (e.g. two POS terminals both selling the last unit of one SKU at
-- the same moment) can each read the same pre-insert balance, both pass the check, and both
-- commit, taking stock negative with the guard never having caught it.
--
-- Fix: take a transaction-scoped advisory lock keyed on (item_type, item_id) before reading the
-- balance. A concurrent transaction touching the SAME item blocks here until the first one
-- commits or rolls back, so the second one's balance read is guaranteed to see the first one's
-- effect — closing the race without taking a real row lock on a row that doesn't exist yet.
CREATE OR REPLACE FUNCTION guard_stock_not_negative()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  current_stock NUMERIC;
BEGIN
  IF NEW.movement < 0 AND NEW.ref_type IN ('sale', 'work_order_consume', 'transfer_out', 'purchase_return') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.item_type || ':' || NEW.item_id, 0));

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
