-- edit_order has been re-defined 3 times across migrations (add_order_edit_function.sql,
-- add_order_received_delivery_time.sql, add_stitching_orders_v1_features.sql), each time
-- appending new trailing parameters. Because CREATE OR REPLACE FUNCTION only replaces a
-- function with the SAME parameter signature, Postgres treats each different signature as a
-- distinct overload — so all 3 versions still exist and are still callable side by side. The
-- app only ever calls the newest (22-param) one, so the two older, narrower overloads are
-- dead code sitting in the schema: a stale RPC someone could call directly (bypassing the
-- optimistic-lock/rework/cost fields the current callers rely on) and a source of ambiguity
-- as the signature evolves further. Drop them, keeping only the current 22-param definition
-- from add_stitching_orders_v1_features.sql untouched.
DROP FUNCTION IF EXISTS edit_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, TEXT, TEXT,
  JSONB, JSONB, JSONB, JSONB, TEXT, TEXT, INTEGER
);

DROP FUNCTION IF EXISTS edit_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, TEXT, TEXT,
  JSONB, JSONB, JSONB, JSONB, TEXT, TEXT, INTEGER, TEXT, TEXT
);
