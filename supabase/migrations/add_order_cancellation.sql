-- Gives stitching orders a void path that isn't deletion.
--
-- The order lifecycle is received → cutting → stitching → finishing → ready → delivered →
-- payment, with no cancelled state anywhere in it (purchase orders have one; stitching orders
-- never did). So when a customer cancels — which happens in every tailoring shop — the only
-- options were to leave the order sitting in the pipeline counting as revenue forever, or hard
-- delete it and lose the record that it ever existed. A forensic audit flagged that: an ERP
-- should never require destroying a record to correct one.
--
-- Deliberately NOT a new value in `status`. That column drives the whole stage pipeline, the
-- board columns, stage-timing reports and getNextStage(); adding a seventh stage would have had
-- to be handled at every one of those sites, and "cancelled" is not a stage of work anyway — it
-- is a fact about the order as a whole. A nullable timestamp leaves every existing stage query
-- untouched and makes `cancelled_at IS NOT NULL` the single test.
alter table orders add column if not exists cancelled_at    timestamptz;
alter table orders add column if not exists cancelled_by    text;
alter table orders add column if not exists cancel_reason   text not null default '';

-- Partial index: every revenue/receivables query filters cancelled orders out, and the cancelled
-- set stays small, so this keeps that filter cheap without carrying an index entry per live order.
create index if not exists orders_cancelled_at_idx on orders (cancelled_at) where cancelled_at is not null;
