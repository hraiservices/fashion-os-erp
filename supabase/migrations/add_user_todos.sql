-- Desktop utility rail's new "To-do" icon — a personal checklist per account, same rail-slot
-- pattern as user_scratch_notes/user_mini_sheets: addressed by user_email, no RLS policy since
-- every access goes through the service-role client via /api/todos, which scopes everything to
-- the caller's own session email server-side.
CREATE TABLE IF NOT EXISTS user_todos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  text       text NOT NULL DEFAULT '',
  done       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_todos_user ON user_todos (user_email, created_at DESC);

ALTER TABLE user_todos ENABLE ROW LEVEL SECURITY;
