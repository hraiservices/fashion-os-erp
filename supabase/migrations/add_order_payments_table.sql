-- Stitching-order payments have never been stored as real rows — only an increment to
-- orders.advance/balance plus a free-text history/activity_log line. That meant no individual
-- payment could ever be corrected or deleted, and an order with any payment collected against
-- it could never be deleted at all (see the advance > 0 guard in orders/[id]/route.ts DELETE).
-- This table gives stitching orders the same real, append-only payment ledger sales_payments
-- already has (add_sales_module.sql) — orders.advance/balance stay the cached columns
-- everything else in the app already reads; this is an itemized record alongside them, with
-- explicit reversal handled by delete_order_payment() (see extend_record_order_payment_ledger.sql)
-- since — unlike sales_payments, where an invoice's balance is always derived live — advance/
-- balance here are cached and don't self-correct when a row disappears.
CREATE TABLE IF NOT EXISTS order_payments (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id      TEXT          NOT NULL REFERENCES orders(id),
  amount        NUMERIC(10,2) NOT NULL,           -- cash actually collected (excludes pt_discount)
  pt_discount   NUMERIC(10,2) NOT NULL DEFAULT 0, -- rupee value of loyalty points applied, if any
  -- Points count, not just the rupee discount — needed to refund the exact same point balance on
  -- delete, since the redemption rate isn't necessarily a fixed 1:1 rupee-per-point ratio.
  pts_redeemed  INTEGER       NOT NULL DEFAULT 0,
  method        TEXT          NOT NULL DEFAULT 'Cash',
  note          TEXT          NOT NULL DEFAULT '',
  created_by    TEXT,
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments (order_id);

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON order_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
