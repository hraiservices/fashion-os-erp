-- Desktop utility rail's new "Sheets" icon — a small multi-sheet spreadsheet (cell grid with
-- formula support), same rail slot pattern as user_scratch_notes: several named sheets per
-- account, addressed by user_email, no RLS policy since every access goes through the
-- service-role client via /api/sheets, which scopes everything to the caller's own session
-- email server-side.
CREATE TABLE IF NOT EXISTS user_mini_sheets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  name       text NOT NULL DEFAULT 'Sheet',
  -- Sparse cell map, e.g. {"A1": "120", "B1": "=A1*2"} — only cells with content are stored.
  cells      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_mini_sheets_user ON user_mini_sheets (user_email, created_at DESC);

ALTER TABLE user_mini_sheets ENABLE ROW LEVEL SECURITY;
