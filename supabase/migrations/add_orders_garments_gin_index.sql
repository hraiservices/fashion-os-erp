-- Speeds up JSONB containment queries against orders.garments (e.g. `garments @> '[{"tailor":
-- "..."}]'`), used by getPieceRateAdvanceCap (src/lib/piece-rate.ts) so an employee's advance
-- cap is computed from just their own garments instead of scanning every confirmed order.
-- jsonb_path_ops is smaller and faster than the default jsonb_ops for exact-containment lookups
-- like this one (it doesn't support the `?`/`?|`/`?&` key-existence operators, which nothing
-- here needs).
CREATE INDEX IF NOT EXISTS idx_orders_garments_gin ON orders USING GIN (garments jsonb_path_ops);
