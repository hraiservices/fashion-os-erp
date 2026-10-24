-- Targets > Planner: a private, per-person daily/weekly agenda (notes + to-do lines), separate
-- from the shared Leads/Tasks tables. Same access model as every other Targets table (see
-- add_targets_module.sql's header comment): RLS is on with deliberately no policy for
-- `authenticated`, so reads/writes go only through /api/targets/planner/** (service-role client,
-- after a permission check). Unlike leads/tasks, visibility here is owner-only even for someone
-- with viewAllTargets — a planner entry is never shown to anyone but the person who wrote it.
CREATE TABLE IF NOT EXISTS planner_entries (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  entry_date        DATE NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'todo')),
  text              TEXT NOT NULL,
  done              BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_at       TIMESTAMPTZ,
  -- The IST calendar date a reminder was last pushed for (see the planner-reminders cron) — null
  -- = not sent. Same dedupe pattern as work_tasks.reminder_sent_for.
  reminder_sent_for DATE,
  link_type         TEXT CHECK (link_type IS NULL OR link_type IN ('lead', 'customer', 'order', 'invoice')),
  link_id           TEXT,
  -- Denormalized snapshot (e.g. "Monica Sharma", "Order SOR-2026-0436") so the UI never needs a
  -- join across leads/customers/orders just to show what an entry is linked to.
  link_label        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planner_entries_owner_date ON planner_entries (owner_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_planner_entries_reminder ON planner_entries (reminder_at) WHERE reminder_at IS NOT NULL;

ALTER TABLE planner_entries ENABLE ROW LEVEL SECURITY;
