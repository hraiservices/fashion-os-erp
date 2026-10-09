-- Day Book "close the day": the owner counts the cash in the drawer at the end of the day and
-- records it against what the system expected (opening cash + cash in - cash out). The counted
-- figure also becomes the next day's opening cash, so the drawer reconciles day over day.
--
-- Written and read only through the Day Book API routes (service-role client, after a
-- permission check) — RLS is on with deliberately no policy for `authenticated`, so the browser
-- can't read or rewrite a closed day directly.
CREATE TABLE IF NOT EXISTS day_book_closings (
  close_date     DATE PRIMARY KEY,
  opening_cash   NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash  NUMERIC(12,2) NOT NULL DEFAULT 0,
  counted_cash   NUMERIC(12,2) NOT NULL DEFAULT 0,
  variance       NUMERIC(12,2) NOT NULL DEFAULT 0,
  note           TEXT NOT NULL DEFAULT '',
  closed_by      TEXT,
  closed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE day_book_closings ENABLE ROW LEVEL SECURITY;

-- Cash that moves in or out of the drawer without being a customer payment, expense or vendor
-- payment — a bank deposit, the owner taking cash home, salary handed over in cash, a float
-- top-up. Without these the drawer would show an unexplained shortage at close. Same access
-- model as day_book_closings: service-role API only, RLS on with no policy for `authenticated`.
CREATE TABLE IF NOT EXISTS day_book_cash_adjustments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  adj_date    DATE NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('in', 'out')),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason      TEXT NOT NULL DEFAULT 'Other',
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_day_book_cash_adjustments_date ON day_book_cash_adjustments (adj_date);

ALTER TABLE day_book_cash_adjustments ENABLE ROW LEVEL SECURITY;
