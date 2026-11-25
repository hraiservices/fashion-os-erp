-- Per-user notification state. admin_notifications.read (add_stage_notifications.sql or
-- similar) is a single shared flag — anyone dismissing one notification, or any admin/manager
-- clicking "Clear all", marked it read for EVERY user, not just themselves. A manager clearing
-- their own bell could silently hide a leave request or payment notification from an admin who
-- hadn't opened the bell yet. This adds a proper per-recipient read record instead: each user's
-- "unread" is now their own absence from notification_reads, not a shared column on the
-- notification row itself. admin_notifications.read is left in place (nothing currently writing
-- it needs to change) but the API routes stop relying on it for per-user unread computation.
--
-- notification_mutes lets a user turn off one notification category (see
-- notification-alerts.ts's NotificationCategory — "orders" | "money" | "people" | "briefing")
-- for themselves, without affecting anyone else or needing a role change.
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id BIGINT NOT NULL REFERENCES admin_notifications(id) ON DELETE CASCADE,
  user_email      TEXT NOT NULL,
  read_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads (user_email);

CREATE TABLE IF NOT EXISTS notification_mutes (
  user_email TEXT NOT NULL,
  category   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_email, category)
);

ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON notification_reads;
CREATE POLICY "authenticated_read" ON notification_reads FOR SELECT TO authenticated USING (true);

ALTER TABLE notification_mutes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read" ON notification_mutes;
CREATE POLICY "authenticated_read" ON notification_mutes FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policy on either table for `authenticated` — same pattern as
-- push_subscriptions/customer_credit_balances: only the server (service-role client, which
-- bypasses RLS) writes, exclusively via the /api/notifications/* routes, which check the
-- caller's own session first and only ever write rows keyed to that caller's own email.
