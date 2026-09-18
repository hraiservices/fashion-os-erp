-- One order per garment (the "split multi-garment orders" feature): when a customer's visit
-- produces several individually-trackable garments (e.g. 3 suits), each becomes its own order
-- row so it can move through Received/Cutting/Stitching/Ready independently on the board — but
-- they still came from one visit, so group_id links them back together for staff to see as one
-- customer group. Deliberately not a foreign key to another orders row (no "parent" order) — the
-- group is a flat set of equal siblings, sharing one generated id, not a hierarchy.
alter table public.orders add column if not exists group_id text null;

create index if not exists orders_group_id_idx on public.orders (group_id) where group_id is not null;
