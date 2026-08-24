-- Two fixes to the original name->id backfill (add_tailor_piece_rate.sql):
--
-- P2: it matched against ANY employee, not specifically tailors -- an order whose tailor text
-- happened to coincide with a manager's or accountant's name got silently pointed at that
-- non-tailor employee. This retry scopes matching to role ilike 'tailor' only.
--
-- P1: it skipped any name shared by more than one employee, leaving those orders as permanent
-- free text that can never match an id again (commission/piece-rate id-based matching can only
-- ever equal a real employee id). Scoping to role='tailor' narrows the candidate pool, so a
-- name that collided with a non-tailor employee before now has a real chance of being a unique
-- match among tailors specifically. Anything still ambiguous even among tailors is left alone
-- -- there's no safe way to auto-resolve that, it needs a human to pick the right one.

UPDATE orders o
SET tailor = e.id::text
FROM employees e
WHERE o.tailor <> ''
  AND o.tailor !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'  -- skip rows already converted to a uuid
  AND lower(trim(e.name)) = lower(trim(o.tailor))
  AND e.role ILIKE 'tailor'
  AND (SELECT COUNT(*) FROM employees e2 WHERE lower(trim(e2.name)) = lower(trim(o.tailor)) AND e2.role ILIKE 'tailor') = 1;

UPDATE work_orders w
SET tailor = e.id::text
FROM employees e
WHERE w.tailor <> ''
  AND w.tailor !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND lower(trim(e.name)) = lower(trim(w.tailor))
  AND e.role ILIKE 'tailor'
  AND (SELECT COUNT(*) FROM employees e2 WHERE lower(trim(e2.name)) = lower(trim(w.tailor)) AND e2.role ILIKE 'tailor') = 1;
