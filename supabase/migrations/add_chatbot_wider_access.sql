-- Run this once in your Supabase SQL editor, after add_chatbot_module.sql.
--
-- ERP Copilot — Phase 2: widen coverage to expenses, payments received (both stitching-order
-- and product-sale payments, combined into one ledger), and low-stock inventory. Same
-- least-privilege pattern as Phase 1 — the chatbot's DB role only ever gets SELECT on these
-- views, never the underlying tables.
--
-- NOTE: `item_type` values below ('product' / 'raw_material') are inferred from the app's
-- table names, not verified against your live inventory_stock view — check
-- `select distinct item_type from inventory_stock` and adjust the two UNION branches below if
-- your data uses different labels before relying on this view's is_low_stock column.

CREATE OR REPLACE VIEW v_chatbot_expenses AS
SELECT id, date, category, description, amount, pay_method, customer_name, customer_mobile, created_at
FROM expenses;

CREATE OR REPLACE VIEW v_chatbot_payments AS
SELECT
  op.id,
  'order' AS source,
  op.order_id AS reference_id,
  o.name AS customer_name,
  o.mobile AS customer_mobile,
  op.amount,
  op.method,
  op.created_at::date AS date,
  op.created_at
FROM order_payments op
JOIN orders o ON o.id = op.order_id
UNION ALL
SELECT
  sp.id,
  'invoice' AS source,
  sp.invoice_id AS reference_id,
  i.customer_name,
  sp.customer_mobile,
  sp.amount,
  sp.method,
  sp.date AS date,
  sp.created_at
FROM sales_payments sp
JOIN sales_invoices i ON i.id = sp.invoice_id;

CREATE OR REPLACE VIEW v_chatbot_inventory AS
SELECT
  p.id,
  'product' AS item_type,
  p.name,
  p.sku,
  p.category,
  COALESCE(s.stock_qty, 0) AS stock_qty,
  p.low_stock_alert,
  (COALESCE(s.stock_qty, 0) <= p.low_stock_alert) AS is_low_stock
FROM products p
LEFT JOIN inventory_stock s ON s.item_type = 'product' AND s.item_id = p.id
UNION ALL
SELECT
  rm.id,
  'raw_material' AS item_type,
  rm.name,
  NULL AS sku,
  rm.category,
  COALESCE(s.stock_qty, 0) AS stock_qty,
  rm.low_stock_alert,
  (COALESCE(s.stock_qty, 0) <= rm.low_stock_alert) AS is_low_stock
FROM raw_materials rm
LEFT JOIN inventory_stock s ON s.item_type = 'raw_material' AND s.item_id = rm.id;

GRANT SELECT ON v_chatbot_expenses, v_chatbot_payments, v_chatbot_inventory TO chatbot_readonly;
