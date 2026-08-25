-- ============================================================================
-- DATA INTEGRITY CHECK — read-only. Nothing here modifies, deletes or resets
-- anything. Run the whole file in the Supabase SQL Editor and send back the
-- results; each block prints its own label so the output is self-describing.
-- ============================================================================

-- 1. Which new database objects actually exist yet?
--    Anything reported 'MISSING' means a migration hasn't been run, and the
--    matching feature is silently broken in the app.
SELECT '1. SCHEMA OBJECTS' AS check_name,
       obj,
       CASE WHEN present THEN 'ok' ELSE 'MISSING — run its migration' END AS status
FROM (
  SELECT 'table order_payments'   AS obj, to_regclass('public.order_payments') IS NOT NULL AS present
  UNION ALL SELECT 'table order_expenses', to_regclass('public.order_expenses') IS NOT NULL
  UNION ALL SELECT 'column orders.piece_rate_paid_at',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='piece_rate_paid_at')
  UNION ALL SELECT 'column orders.payables_confirmed_at',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payables_confirmed_at')
  UNION ALL SELECT 'function delete_order_payment',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='delete_order_payment')
  UNION ALL SELECT 'function snapshot_tailor_payables',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='snapshot_tailor_payables')
  UNION ALL SELECT 'record_order_payment accepts payment-method args (9 params)',
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='record_order_payment' AND pronargs=9)
  UNION ALL SELECT 'edit_order uses NUMERIC money params (not INTEGER)',
    EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname='edit_order'
            AND 'numeric'::regtype = ANY(p.proargtypes::oid[]))
) t;

-- 2. Orders whose collected money has NO payment ledger row behind it.
--    These are invisible in the Payments section, missing from payment
--    reports, and cannot be deleted. Expect 0 rows once backfill has run.
SELECT '2. ORDERS WITH MONEY BUT NO PAYMENT ROWS' AS check_name,
       o.id, o.name, o.advance AS money_collected,
       COALESCE(SUM(p.amount + p.pt_discount), 0) AS ledger_total,
       o.advance - COALESCE(SUM(p.amount + p.pt_discount), 0) AS unexplained
FROM orders o
LEFT JOIN order_payments p ON p.order_id = o.id
WHERE o.advance > 0
GROUP BY o.id, o.name, o.advance
HAVING o.advance <> COALESCE(SUM(p.amount + p.pt_discount), 0)
ORDER BY unexplained DESC;

-- 3. Tailor payables frozen at ₹0 — work done, tailor assigned, but the rate
--    card had no rate at the time. These people are currently owed nothing.
SELECT '3. GARMENTS STUCK AT ZERO PAYABLE' AS check_name,
       o.id AS order_id, o.name AS customer, o.ready_at,
       g->>'type' AS garment, g->>'tailor' AS tailor_id
FROM orders o, jsonb_array_elements(o.garments) g
WHERE o.ready_at IS NOT NULL
  AND COALESCE(g->>'tailor','') <> ''
  AND (g->'payableAmount') IS NOT NULL
  AND (g->>'payableAmount')::NUMERIC = 0
ORDER BY o.ready_at DESC;

-- 4. Payables belonging to nobody — the garment's tailor is a typed name, not
--    a linked employee, so this money vanishes from every tailor total.
SELECT '4. UNATTRIBUTED TAILOR PAYABLES' AS check_name,
       o.id AS order_id, g->>'tailor' AS stored_tailor,
       (g->>'payableAmount')::NUMERIC AS amount_owed
FROM orders o, jsonb_array_elements(o.garments) g
WHERE COALESCE(g->>'tailor','') <> ''
  AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.id::text = g->>'tailor')
ORDER BY amount_owed DESC NULLS LAST;

-- 5. Payables marked PAID that never appeared on any payslip — money the
--    tailor earned but can no longer be paid through the app.
SELECT '5. PAYABLES MARKED PAID WITH NO PAYSLIP' AS check_name,
       o.id AS order_id, o.piece_rate_paid_at,
       g->>'tailor' AS tailor_id, (g->>'payableAmount')::NUMERIC AS amount
FROM orders o, jsonb_array_elements(o.garments) g
WHERE o.piece_rate_paid_at IS NOT NULL
  AND COALESCE(g->>'tailor','') <> ''
  AND (g->>'payableAmount')::NUMERIC > 0
  AND NOT EXISTS (
    SELECT 1 FROM payslips ps
    WHERE ps.employee_id::text = g->>'tailor' AND ps.piece_rate_pay > 0
  )
ORDER BY o.piece_rate_paid_at DESC;

-- 6. Orders that can never be edited or moved: unknown stage values, or an
--    advance larger than the total.
SELECT '6. BROKEN ORDER RECORDS' AS check_name, id, name, status, total, advance,
       CASE
         WHEN status NOT IN ('received','cutting','stitching','ready','delivered','payment')
           THEN 'unknown stage: ' || status
         WHEN advance > total THEN 'overpaid (advance > total)'
       END AS problem
FROM orders
WHERE status NOT IN ('received','cutting','stitching','ready','delivered','payment')
   OR advance > total
ORDER BY id;

-- 7. Orders sitting in the terminal "Payment" stage while still owing money.
SELECT '7. MARKED PAID BUT STILL OWING' AS check_name,
       id, name, total, advance, balance
FROM orders
WHERE status = 'payment' AND balance > 0
ORDER BY balance DESC;

-- 8. Duplicate payment rows — same order, same amount, within a minute of
--    each other. Usually a double-submitted form.
SELECT '8. POSSIBLE DUPLICATE PAYMENTS' AS check_name,
       a.order_id, a.amount, a.created_at AS first_at, b.created_at AS second_at
FROM order_payments a
JOIN order_payments b
  ON a.order_id = b.order_id AND a.amount = b.amount AND a.id < b.id
 AND b.created_at BETWEEN a.created_at AND a.created_at + INTERVAL '1 minute'
ORDER BY a.order_id;

-- 9. Orphans — payment/expense rows pointing at an order that no longer exists.
SELECT '9. ORPHANED ROWS' AS check_name, 'order_payments' AS source, p.id::text AS row_id, p.order_id
FROM order_payments p WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = p.order_id)
UNION ALL
SELECT '9. ORPHANED ROWS', 'order_expenses', e.id::text, e.order_id
FROM order_expenses e WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = e.order_id);

-- 10. Summary totals — cross-check these against what the app's reports show.
SELECT '10. TOTALS TO CROSS-CHECK' AS check_name, metric, value FROM (
  SELECT 'Total collected on stitching orders (orders.advance)' AS metric, COALESCE(SUM(advance),0)::text AS value FROM orders
  UNION ALL SELECT 'Total in stitching payment ledger', COALESCE(SUM(amount + pt_discount),0)::text FROM order_payments
  UNION ALL SELECT 'Total cash in stitching ledger (excl. loyalty pts)', COALESCE(SUM(amount),0)::text FROM order_payments
  UNION ALL SELECT 'Total outstanding on stitching orders', COALESCE(SUM(balance),0)::text FROM orders WHERE balance > 0
  UNION ALL SELECT 'Total collected on invoices', COALESCE(SUM(amount),0)::text FROM sales_payments
  UNION ALL SELECT 'Tailor payables still unpaid', COALESCE(SUM((g->>'payableAmount')::NUMERIC),0)::text
    FROM orders o, jsonb_array_elements(o.garments) g
    WHERE o.payables_confirmed_at IS NOT NULL AND o.piece_rate_paid_at IS NULL
) t;
