-- Multiple colored sticky notes per user (desktop utility rail's Notes icon), replacing the
-- single scratchpad_note column from add_user_scratchpad_note.sql — that shipped as one note
-- per account, but a real "notebook" needs several, each independently colored/deletable/
-- copyable, same shape as Zoho Notebook. Addressed by user email like user_roles, but kept as
-- its own table (not a user_roles column) since it's one-to-many.
CREATE TABLE IF NOT EXISTS user_scratch_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  color      text NOT NULL DEFAULT 'yellow',
  content    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_scratch_notes_user ON user_scratch_notes (user_email, created_at DESC);

-- Migrate any existing single scratchpad notes over so nobody's note disappears, then drop the
-- old column — the rail's Notes icon now only ever reads/writes user_scratch_notes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_roles' AND column_name = 'scratchpad_note') THEN
    INSERT INTO user_scratch_notes (user_email, color, content)
    SELECT email, 'yellow', scratchpad_note FROM user_roles WHERE COALESCE(scratchpad_note, '') <> '';
    ALTER TABLE user_roles DROP COLUMN scratchpad_note;
  END IF;
END $$;

-- No RLS policy — every access goes through the service-role client via /api/notes, which scopes
-- everything to the caller's own session email server-side, same pattern as the rest of this
-- table's siblings (payslips, employee_advances, etc.).
ALTER TABLE user_scratch_notes ENABLE ROW LEVEL SECURITY;
