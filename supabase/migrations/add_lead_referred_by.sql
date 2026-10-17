-- Who sent this lead (a customer's name or mobile). Free text; used on the lead page and as a reminder to thank the referrer.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by TEXT NOT NULL DEFAULT '';
