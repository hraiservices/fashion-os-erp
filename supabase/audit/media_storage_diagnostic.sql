-- ============================================================================
-- FASHION FLOW — ORDER MEDIA / TOAST STORAGE DIAGNOSTIC (READ-ONLY)
-- ============================================================================
-- Confirms and quantifies the finding: orders.images/audios/videos store raw
-- base64 media inline (src/lib/media.ts — no Supabase Storage bucket is used
-- for these), which is what drives TOAST storage. Every statement is
-- SELECT-only, safe to run against production.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — Confirm the reported numbers directly: table heap size vs
-- TOAST size vs total, for `orders` specifically
-- ============================================================================

SELECT
  pg_size_pretty(pg_relation_size('orders'::regclass)) AS heap_size,
  pg_size_pretty(pg_total_relation_size('orders'::regclass) - pg_relation_size('orders'::regclass) - pg_indexes_size('orders'::regclass)) AS toast_size_approx,
  pg_size_pretty(pg_indexes_size('orders'::regclass)) AS index_size,
  pg_size_pretty(pg_total_relation_size('orders'::regclass)) AS total_size,
  (SELECT count(*) FROM orders) AS row_count;


-- ============================================================================
-- SECTION 2 — Which column(s) are actually consuming the space? Average and
-- total on-disk size (pg_column_size accounts for TOAST/compression) per
-- media/JSON column, ranked descending. This is the number that tells us
-- whether it's really images/audios/videos, or something else entirely
-- (garments/history/measurements/payments/pay_breakdown).
-- ============================================================================

SELECT
  'images'          AS column_name, pg_size_pretty(sum(pg_column_size(images))::bigint)          AS total_size, pg_size_pretty(avg(pg_column_size(images))::bigint)          AS avg_size_per_row
FROM orders
UNION ALL
SELECT 'audios',           pg_size_pretty(sum(pg_column_size(audios))::bigint),           pg_size_pretty(avg(pg_column_size(audios))::bigint)           FROM orders
UNION ALL
SELECT 'videos',           pg_size_pretty(sum(pg_column_size(videos))::bigint),           pg_size_pretty(avg(pg_column_size(videos))::bigint)           FROM orders
UNION ALL
SELECT 'garments',         pg_size_pretty(sum(pg_column_size(garments))::bigint),         pg_size_pretty(avg(pg_column_size(garments))::bigint)         FROM orders
UNION ALL
SELECT 'history',          pg_size_pretty(sum(pg_column_size(history))::bigint),          pg_size_pretty(avg(pg_column_size(history))::bigint)          FROM orders
UNION ALL
SELECT 'measurements',     pg_size_pretty(sum(pg_column_size(measurements))::bigint),     pg_size_pretty(avg(pg_column_size(measurements))::bigint)     FROM orders
UNION ALL
SELECT 'payments',         pg_size_pretty(sum(pg_column_size(payments))::bigint),         pg_size_pretty(avg(pg_column_size(payments))::bigint)         FROM orders
UNION ALL
SELECT 'pay_breakdown',    pg_size_pretty(sum(pg_column_size(pay_breakdown))::bigint),    pg_size_pretty(avg(pg_column_size(pay_breakdown))::bigint)    FROM orders
ORDER BY 2 DESC NULLS LAST;
-- NOTE: the SELECT above can't ORDER BY the pretty-printed text meaningfully.
-- Run this second version instead if you want it correctly sorted (same
-- data, raw bytes for sorting, pretty-printed for reading):

SELECT
  column_name,
  pg_size_pretty(total_bytes) AS total_size,
  pg_size_pretty((total_bytes / NULLIF(row_count, 0))::bigint) AS avg_size_per_row,
  row_count
FROM (
  SELECT 'images' AS column_name, sum(pg_column_size(images))::bigint AS total_bytes, count(*) FILTER (WHERE images IS NOT NULL AND images <> ARRAY[]::text[]) AS row_count FROM orders
  UNION ALL
  SELECT 'audios', sum(pg_column_size(audios))::bigint, count(*) FILTER (WHERE audios IS NOT NULL AND jsonb_array_length(audios) > 0) FROM orders
  UNION ALL
  SELECT 'videos', sum(pg_column_size(videos))::bigint, count(*) FILTER (WHERE videos IS NOT NULL AND jsonb_array_length(videos) > 0) FROM orders
  UNION ALL
  SELECT 'garments', sum(pg_column_size(garments))::bigint, count(*) FILTER (WHERE garments IS NOT NULL AND jsonb_array_length(garments) > 0) FROM orders
  UNION ALL
  SELECT 'history', sum(pg_column_size(history))::bigint, count(*) FILTER (WHERE history IS NOT NULL) FROM orders
  UNION ALL
  SELECT 'measurements', sum(pg_column_size(measurements))::bigint, count(*) FILTER (WHERE measurements IS NOT NULL) FROM orders
  UNION ALL
  SELECT 'payments', sum(pg_column_size(payments))::bigint, count(*) FILTER (WHERE payments IS NOT NULL) FROM orders
  UNION ALL
  SELECT 'pay_breakdown', sum(pg_column_size(pay_breakdown))::bigint, count(*) FILTER (WHERE pay_breakdown IS NOT NULL) FROM orders
) t
ORDER BY total_bytes DESC NULLS LAST;


-- ============================================================================
-- SECTION 3 — Distribution: how many orders actually carry media at all, and
-- how big are the biggest few orders? (confirms whether this is "every order
-- has a bit of media" or "a handful of orders are enormous")
-- ============================================================================

SELECT
  count(*) AS total_orders,
  count(*) FILTER (WHERE images IS NOT NULL AND images <> ARRAY[]::text[]) AS orders_with_images,
  count(*) FILTER (WHERE audios IS NOT NULL AND jsonb_array_length(audios) > 0) AS orders_with_audio,
  count(*) FILTER (WHERE videos IS NOT NULL AND jsonb_array_length(videos) > 0) AS orders_with_video
FROM orders;

-- Top 10 biggest individual order rows by total media size, so we know if
-- this is broad or concentrated in a few outliers.
SELECT
  id,
  pg_size_pretty(pg_column_size(images))  AS images_size,
  pg_size_pretty(pg_column_size(audios))  AS audios_size,
  pg_size_pretty(pg_column_size(videos))  AS videos_size,
  pg_size_pretty((pg_column_size(images) + pg_column_size(audios) + pg_column_size(videos))::bigint) AS media_total
FROM orders
ORDER BY (pg_column_size(images) + pg_column_size(audios) + pg_column_size(videos)) DESC
LIMIT 10;


-- ============================================================================
-- SECTION 4 — Growth projection inputs: average media bytes per order right
-- now, so we can extrapolate to 500 / 2,000 / 10,000 orders
-- ============================================================================

SELECT
  count(*) AS current_order_count,
  pg_size_pretty(
    (sum(pg_column_size(images)) + sum(pg_column_size(audios)) + sum(pg_column_size(videos)))::bigint
  ) AS current_total_media_bytes,
  pg_size_pretty(
    ((sum(pg_column_size(images)) + sum(pg_column_size(audios)) + sum(pg_column_size(videos))) / NULLIF(count(*), 0))::bigint
  ) AS avg_media_bytes_per_order
FROM orders;


-- ============================================================================
-- SECTION 5 — Same check for the two other tables in the app known to store
-- images the same way (products, employees) — confirms whether this is an
-- orders-only issue or a schema-wide pattern
-- ============================================================================

SELECT
  pg_size_pretty(pg_relation_size('products'::regclass)) AS products_heap,
  pg_size_pretty(pg_total_relation_size('products'::regclass) - pg_relation_size('products'::regclass) - pg_indexes_size('products'::regclass)) AS products_toast_approx,
  (SELECT count(*) FROM products) AS products_row_count;

SELECT
  pg_size_pretty(pg_relation_size('employees'::regclass)) AS employees_heap,
  pg_size_pretty(pg_total_relation_size('employees'::regclass) - pg_relation_size('employees'::regclass) - pg_indexes_size('employees'::regclass)) AS employees_toast_approx,
  (SELECT count(*) FROM employees) AS employees_row_count;


-- ============================================================================
-- SECTION 6 — Overall database size, for context on how much headroom this
-- actually matters against (Supabase's free tier is commonly 500MB-1GB;
-- paid tiers vary — this just tells us the current total footprint)
-- ============================================================================

SELECT pg_size_pretty(pg_database_size(current_database())) AS total_database_size;


-- ============================================================================
-- END OF DIAGNOSTIC SCRIPT
-- ============================================================================
