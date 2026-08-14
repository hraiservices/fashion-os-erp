-- A 4-6 digit PIN has low entropy (10,000-1,000,000 combinations) -- without a lockout, an
-- attacker who knows an employee's mobile number could brute-force their PIN by simply
-- hammering /api/attendance/login. This adds a simple counter-based lockout: 5 wrong PINs
-- locks that employee's self-service login for 15 minutes.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS failed_pin_attempts INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until     TIMESTAMPTZ;
