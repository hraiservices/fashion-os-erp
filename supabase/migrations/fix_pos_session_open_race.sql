-- Fixes a real concurrency bug found in a forensic audit: "one open register at a time" was
-- enforced only by a SELECT-then-INSERT check in the API route (see api/pos/session/route.ts) —
-- a plain check-then-act with no atomicity. Two near-simultaneous "Open Register" submissions
-- (two browser tabs, or two staff) could both pass the SELECT before either INSERT committed,
-- leaving two 'open' pos_sessions rows and splitting the same cash drawer across two
-- reconciliations, both of which would then be wrong.
--
-- A partial unique index makes this the database's job: only one row with status='open' can
-- ever exist, and a racing second INSERT fails with a unique_violation the route can catch
-- and turn into the same friendly "already open" message it already gives today.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sessions_one_open
  ON pos_sessions (status) WHERE status = 'open';
