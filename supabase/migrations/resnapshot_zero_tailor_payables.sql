-- Recalculates tailor payables that were frozen at ₹0.
--
-- The ORIGINAL snapshot_tailor_payables used COALESCE(..., 0), so any garment that reached
-- "ready" before the Tailor Payable Rates card had an entry for its type/lining/order-type got
-- a hard `"payableAmount": 0` written into orders.garments. A later fix stopped CREATING new
-- zeros and made the snapshot retry whenever an order re-enters "ready" — but that retry is
-- gated on `payableAmount IS NULL`, and JSON `0` is not NULL. So every garment zeroed by the
-- original version is stuck at ₹0 permanently, and the tailor who sewed it is owed nothing,
-- with no way to fix it from the UI.
--
-- This clears that frozen 0 (only where a tailor is actually assigned) and immediately
-- re-snapshots at the CURRENT rate card. Garments whose type/lining still has no configured
-- rate are left with payableAmount unset — genuinely unknown rather than a wrong ₹0 — and the
-- Tailor Payables report surfaces them as a warning.
--
-- Deliberately skips orders whose payables were already paid out (piece_rate_paid_at set):
-- those figures are settled history and must not move retroactively.
--
-- Safe to re-run: a garment that already has a correct nonzero payable is untouched.
DO $$
DECLARE
  v_order   RECORD;
  v_cleared JSONB;
BEGIN
  FOR v_order IN
    SELECT id, garments, order_type
    FROM orders
    WHERE ready_at IS NOT NULL
      AND piece_rate_paid_at IS NULL
      AND garments @> '[{"payableAmount": 0}]'::jsonb
  LOOP
    -- Strip the frozen 0 from every garment that has a tailor assigned, so the snapshot
    -- function's `payableAmount IS NULL` retry gate lets it through.
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN COALESCE(elem->>'tailor', '') <> ''
             AND elem->'payableAmount' IS NOT NULL
             AND (elem->>'payableAmount')::NUMERIC = 0
        THEN elem - 'payableAmount'
        ELSE elem
      END
    ), '[]'::jsonb)
    INTO v_cleared
    FROM jsonb_array_elements(v_order.garments) AS elem;

    UPDATE orders
    SET garments = snapshot_tailor_payables(v_cleared, v_order.order_type)
    WHERE id = v_order.id;
  END LOOP;
END $$;
