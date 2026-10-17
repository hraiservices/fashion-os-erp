-- Extra details a lead can carry, so the first conversation is not lost: when they need the outfit by,
-- their budget, the sizes they shared, and what they want made. They carry over to the order when the lead
-- is turned into one. Every column has a default, so existing leads are untouched.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS needed_by    DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_min   NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_max   NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS measurements TEXT          NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outfit_type  TEXT          NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pieces       INTEGER       NOT NULL DEFAULT 0;
