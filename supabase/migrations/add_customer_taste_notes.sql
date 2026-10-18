-- Short notes on a customer's taste ("likes pastel colours", "prefers loose fit"), one per line. Suggested by AI, kept only when staff approve them.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS taste_notes TEXT NOT NULL DEFAULT '';
