-- Personal quick notes (Zoho Notebook-style sticky notes), shown from a slide-out panel on
-- desktop. Scoped per user by user_email — filtered in the query layer like most of this app's
-- data, not via RLS row ownership (matches the existing "authenticated_all" convention).

CREATE TABLE IF NOT EXISTS quick_notes (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT        NOT NULL,
  content    TEXT        NOT NULL DEFAULT '',
  color      TEXT        NOT NULL DEFAULT 'green',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_notes_user ON quick_notes (user_email, created_at DESC);

ALTER TABLE quick_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON quick_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
