-- Dashboard PIN login: lets a user_roles account log into the full dashboard with mobile
-- number + a short PIN, alongside (not instead of) email+password. Mirrors the attendance PIN
-- system's own columns exactly (add_attendance_pin_lockout.sql) — same bcrypt hash + 5-attempt/
-- 15-minute lockout, same shape, on user_roles instead of employees.
--
-- When a user_roles row is linked to an employee (linked_employee_id), that employee's own
-- pin_hash/lockout columns are the single source of truth for both attendance check-in and
-- dashboard login — this row's own pin_hash stays NULL in that case, so there is never a second
-- PIN to keep in sync. Only an unlinked dashboard user gets their own pin_hash here.
--
-- Writes to these columns are already restricted to the service-role client — see
-- lockdown_user_roles_writes.sql, which blocks direct INSERT/UPDATE on user_roles for the
-- `authenticated` role entirely.

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS pin_hash            TEXT,
  ADD COLUMN IF NOT EXISTS failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until    TIMESTAMPTZ;
