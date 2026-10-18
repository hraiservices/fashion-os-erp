-- Targets: first-response timer on leads, and repeating tasks.
-- Safe to run more than once; every column is optional in the code, so the app works before and after.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

ALTER TABLE work_tasks ADD COLUMN IF NOT EXISTS repeat_rule TEXT NOT NULL DEFAULT '';

ALTER TABLE work_tasks ADD COLUMN IF NOT EXISTS repeat_mode TEXT NOT NULL DEFAULT '';
