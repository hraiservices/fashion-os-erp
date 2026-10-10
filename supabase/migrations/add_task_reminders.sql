-- Task reminders: the "Reminder" choice on a task (on the due date, 1 or 2 days before, a week before) is
-- now actually sent, by the morning cron at /api/cron/task-reminders. This column records the due date a
-- reminder was last sent for, so it is never sent twice — and moving the due date sends it again.
-- Safe to run more than once.

ALTER TABLE work_tasks ADD COLUMN IF NOT EXISTS reminder_sent_for DATE;

-- The cron only looks at open tasks that have a reminder and are due soon.
CREATE INDEX IF NOT EXISTS idx_work_tasks_reminders
  ON work_tasks (due_date)
  WHERE reminder <> 'none' AND status NOT IN ('done', 'cancelled');
