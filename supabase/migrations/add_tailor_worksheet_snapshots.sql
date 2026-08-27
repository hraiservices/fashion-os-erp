-- Daily Tailor Worksheet: a printable per-tailor "today's work + pending from before" report.
-- Every time the report is generated it upserts a snapshot of what's currently pending for each
-- tailor, keyed by (snapshot_date, tailor_id) — regenerating the same day just updates that row.
-- The NEXT generation (any later day) compares against the most recent snapshot dated before
-- today to split "carried over from before" vs "new today" — see src/lib/tailor-worksheet.ts.
-- Same permissive-RLS-plus-API-layer-enforcement convention as every other table this session.

CREATE TABLE IF NOT EXISTS tailor_worksheet_snapshots (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  tailor_id     UUID NOT NULL REFERENCES employees(id),
  pending_keys  JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (snapshot_date, tailor_id)
);

CREATE INDEX IF NOT EXISTS idx_tailor_worksheet_snapshots_tailor_date
  ON tailor_worksheet_snapshots (tailor_id, snapshot_date DESC);

ALTER TABLE tailor_worksheet_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON tailor_worksheet_snapshots;
CREATE POLICY "authenticated_all" ON tailor_worksheet_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
