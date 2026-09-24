-- Admin-visible "who's logged in, when, and who's LIVE right now" (Settings > Users & Access +
-- a dashboard card). Two tables:
--
-- login_events: an append-only history row per successful sign-in — portal (email+password or
-- phone+PIN) or the /checkin PIN attendance kiosk. display_name/role are copied in at write time
-- (not joined later) so history keeps reading sensibly even after an employee record is edited or
-- removed.
--
-- user_presence: one row per logged-in "subject" (a portal login or a checkin-only employee),
-- upserted by a client heartbeat every ~30s while a tab is open. LIVE = last_seen within the
-- last couple of minutes — computed at read time in the API route, not stored here.
--
-- Neither table gets an `authenticated` policy at all — same lockdown as pin_hash/salary/employee
-- documents. Every read goes through the admin-gated /api/presence/* routes (service-role client);
-- every write goes through recordLogin()/touchPresence() in lib/presence.ts, called from the
-- login routes and the heartbeat route, also service-role only.

CREATE TABLE IF NOT EXISTS login_events (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at   TIMESTAMPTZ DEFAULT NOW(),
  login_type    TEXT        NOT NULL CHECK (login_type IN ('portal', 'checkin')),
  method        TEXT        NOT NULL CHECK (method IN ('email', 'phone', 'pin')),
  email         TEXT,
  employee_id   UUID        REFERENCES employees(id) ON DELETE SET NULL,
  display_name  TEXT        NOT NULL,
  role          TEXT
);

CREATE INDEX IF NOT EXISTS login_events_occurred_at_idx ON login_events (occurred_at DESC);

ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS user_presence (
  subject_key   TEXT        PRIMARY KEY,
  login_type    TEXT        NOT NULL CHECK (login_type IN ('portal', 'checkin')),
  method        TEXT        NOT NULL CHECK (method IN ('email', 'phone', 'pin')),
  email         TEXT,
  employee_id   UUID        REFERENCES employees(id) ON DELETE SET NULL,
  display_name  TEXT        NOT NULL,
  role          TEXT,
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
