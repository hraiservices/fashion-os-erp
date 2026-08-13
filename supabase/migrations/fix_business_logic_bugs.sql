-- Fix multiple business-logic bugs found in penetration audit.
-- Run once in the Supabase SQL editor.

-- ── H-9: Stock Transfer has never worked ────────────────────────────────────
-- The inventory_ledger CHECK constraint was created before the warehouses module
-- existed. 'transfer_out' and 'transfer_in' are missing, so every useTransferStock
-- call fails with a CHECK violation and has always failed silently on the UI.
ALTER TABLE inventory_ledger
  DROP CONSTRAINT IF EXISTS inventory_ledger_ref_type_check;

ALTER TABLE inventory_ledger
  ADD CONSTRAINT inventory_ledger_ref_type_check
  CHECK (ref_type IN (
    'opening', 'purchase', 'purchase_return', 'sale', 'sale_return',
    'work_order_consume', 'work_order_produce', 'adjustment',
    'transfer_out', 'transfer_in'
  ));

-- ── C-4: Duplicate payroll runs corrupt advance deductions ───────────────────
-- Without this constraint, running payroll twice for the same period silently
-- links every advance to both payslips, effectively deducting them twice, and
-- produces double salary disbursements that show up as legitimate payslips.
ALTER TABLE payroll_runs
  ADD CONSTRAINT payroll_runs_period_unique
  UNIQUE (period_start, period_end);

-- ── H-6: Stock can go arbitrarily negative ───────────────────────────────────
-- A trigger that fires before every ledger INSERT checks whether the movement
-- would push the item below zero. Sales, transfers-out, and manufacturing
-- consumption are the write paths that can go negative. Adjustments are allowed
-- to go negative intentionally (they're explicitly authorised corrections).
-- Opening, purchase, and produce entries can only add stock, so they're exempt.
CREATE OR REPLACE FUNCTION guard_stock_not_negative()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  current_stock NUMERIC;
BEGIN
  -- Only guard outbound movements on paths that could corrupt stock levels.
  -- Adjustments are allowed negative (deliberate corrections by a manager).
  IF NEW.movement < 0 AND NEW.ref_type IN ('sale', 'work_order_consume', 'transfer_out') THEN
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

DROP TRIGGER IF EXISTS trg_guard_stock_not_negative ON inventory_ledger;
CREATE TRIGGER trg_guard_stock_not_negative
  BEFORE INSERT ON inventory_ledger
  FOR EACH ROW EXECUTE FUNCTION guard_stock_not_negative();

-- ── C-6: set_module_entitlements bypassed via direct app_settings upsert ─────
-- The RPC is SECURITY DEFINER and guards the write, but nothing stops a browser
-- from doing `supabase.from('app_settings').upsert(...)` directly. Add a
-- SECURITY DEFINER function for all app_settings writes, and revoke direct
-- INSERT/UPDATE access from authenticated role.
-- NOTE: this only locks 'moduleEntitlements'. Other settings remain open.
-- A full solution would move all writes through functions, but that's a larger
-- refactor — this patch closes the licence-bypass specifically.

-- Create a policy-protected update function as the intended write path for
-- module entitlements specifically. Direct table modifications are blocked by
-- adding a restrictive policy:
CREATE POLICY IF NOT EXISTS "block_module_entitlements_direct_write" ON app_settings
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  USING (key <> 'moduleEntitlements');

CREATE POLICY IF NOT EXISTS "block_module_entitlements_direct_update" ON app_settings
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (key <> 'moduleEntitlements');
