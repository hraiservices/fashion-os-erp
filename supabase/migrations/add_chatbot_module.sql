-- Run this once in your Supabase SQL editor, then follow the manual steps at the bottom.
--
-- ERP Copilot (chatbot) — Phase 1: Money + Orders question coverage.
--
-- The chatbot's own database connection is a separate, least-privilege Postgres role that
-- can SELECT from these two views and nothing else — no other table, no writes, ever. This
-- is the real safety net for letting an LLM write its own SQL: even a badly-generated query
-- can't touch anything outside this narrow surface.

-- ── Reporting views ──────────────────────────────────────────────────────────
-- Pre-compute the derived fields (balance, payment status, overdue) so the LLM never has to
-- get that logic right on its own — these are exactly the rules that caused real reporting
-- bugs elsewhere in the app when duplicated ad hoc.

-- orders.in_date/delivery_date are legacy TEXT columns (ported as free-form strings from the
-- original app), not proper DATE columns — cast them here so every date comparison the model
-- generates ("delivery_date = CURRENT_DATE", "> CURRENT_DATE - 7", etc.) just works, instead
-- of requiring the model to remember to cast a specific column on this one table.
--
-- Postgres won't let CREATE OR REPLACE VIEW change an existing output column's type (only
-- CREATE OR REPLACE FUNCTION-style body changes / new trailing columns are allowed), so this
-- has to be a drop-and-recreate — which also drops the view's grants, hence the GRANT again
-- right after.
DROP VIEW IF EXISTS v_chatbot_orders;
CREATE VIEW v_chatbot_orders AS
SELECT
  o.id,
  o.name AS customer_name,
  o.mobile AS customer_mobile,
  NULLIF(o.in_date, '')::date AS in_date,
  NULLIF(o.delivery_date, '')::date AS delivery_date,
  o.total,
  o.advance,
  o.balance,
  o.status,
  o.tailor,
  (o.status NOT IN ('delivered', 'payment') AND NULLIF(o.delivery_date, '')::date < CURRENT_DATE) AS is_overdue,
  GREATEST(0, CURRENT_DATE - NULLIF(o.delivery_date, '')::date) AS days_overdue,
  o.created_at
FROM orders o;

CREATE OR REPLACE VIEW v_chatbot_invoices AS
SELECT
  i.id,
  i.invoice_number,
  i.customer_name,
  i.customer_mobile,
  i.invoice_date,
  i.due_date,
  i.total,
  COALESCE(p.paid_total, 0) AS paid_total,
  COALESCE(c.credits_total, 0) AS credits_total,
  GREATEST(0, i.total - COALESCE(c.credits_total, 0) - COALESCE(p.paid_total, 0)) AS balance,
  CASE
    WHEN GREATEST(0, i.total - COALESCE(c.credits_total, 0) - COALESCE(p.paid_total, 0)) <= 0 THEN 'paid'
    WHEN COALESCE(p.paid_total, 0) > 0 THEN 'partial'
    ELSE 'unpaid'
  END AS payment_status,
  (i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE
    AND GREATEST(0, i.total - COALESCE(c.credits_total, 0) - COALESCE(p.paid_total, 0)) > 0) AS is_overdue,
  i.created_at
FROM sales_invoices i
LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid_total FROM sales_payments GROUP BY invoice_id) p ON p.invoice_id = i.id
LEFT JOIN (SELECT invoice_id, SUM(total) AS credits_total FROM sales_credit_notes GROUP BY invoice_id) c ON c.invoice_id = i.id;

-- ── Conversation history ─────────────────────────────────────────────────────
-- Stores the question, the SQL the model generated, and the final answer — the SQL is what
-- you'd need to audit "why did it say that." RLS here is deliberately permissive (matches
-- every other table in this schema); the real per-user/per-role access control lives in the
-- API route, same pattern used for expenses after the recent audit.
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email     TEXT        NOT NULL,
  question       TEXT        NOT NULL,
  generated_sql  TEXT,
  answer         TEXT        NOT NULL,
  error          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_messages_user ON chatbot_messages (user_email, created_at DESC);

ALTER TABLE chatbot_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON chatbot_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Least-privilege database role for the chatbot's own connection ──────────
-- Created with no password here on purpose — never put a real credential in a
-- source-controlled migration file. Set the password yourself in the next step.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chatbot_readonly') THEN
    CREATE ROLE chatbot_readonly LOGIN;
  END IF;
END
$$;

ALTER ROLE chatbot_readonly SET statement_timeout = '5s';
GRANT USAGE ON SCHEMA public TO chatbot_readonly;
GRANT SELECT ON v_chatbot_orders, v_chatbot_invoices TO chatbot_readonly;

-- ═══════════════════════════════════════════════════════════════════════════
-- MANUAL STEPS — do these after running the SQL above:
--
-- 1. Set a strong password for the new role (pick your own, don't reuse another one):
--      ALTER ROLE chatbot_readonly WITH PASSWORD 'your-own-strong-password-here';
--
-- 2. In Supabase Dashboard → Project Settings → Database, copy your connection string
--    and swap in the new role + password to build CHATBOT_DB_URL, e.g.:
--      postgresql://chatbot_readonly:your-password@<your-project-host>:5432/postgres
--    (Use the same host/port your existing connection string already shows — only the
--    username and password change.)
--
-- 3. Add to your .env.local (never commit this file):
--      CHATBOT_DB_URL=postgresql://chatbot_readonly:your-password@...
--      GEMINI_API_KEY=your-key-from-aistudio.google.com
-- ═══════════════════════════════════════════════════════════════════════════
