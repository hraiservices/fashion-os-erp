-- Run this once in your Supabase SQL editor
-- Phase 7: Customizable Dashboard — per-user widget layout (visible cards, order, custom cards).

CREATE TABLE IF NOT EXISTS user_dashboard_layout (
  email      TEXT        PRIMARY KEY,
  widgets    JSONB       NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_dashboard_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON user_dashboard_layout FOR ALL TO authenticated USING (true) WITH CHECK (true);
