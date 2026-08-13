-- Tighten data integrity constraints on orders.
-- Run once in Supabase SQL editor.

-- M4: order_type was added without a CHECK — any string could be stored via direct RPC.
-- The mapOrderRow fallback already coerces unknown values to 'new', but the DB should
-- be the authoritative source of truth.
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_order_type_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('new', 'alteration'));
