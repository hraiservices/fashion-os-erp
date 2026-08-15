-- Configurable sequential document numbering (invoice, stitching order) — e.g. INV/2026/0001,
-- INV/2026/0002, ... Off by default (existing random-ish number generators keep working
-- unchanged); a shop opts in per document type from Settings > Document Numbering.
--
-- The counter lives in a real table with an atomic UPSERT-based increment function, NOT in
-- app_settings JSONB — a JSONB read-modify-write from the API route would race under concurrent
-- invoice/order creation and could hand out the same number twice. This table is the only
-- correctness-critical part of the feature; everything else (prefix, padding, separator) is
-- just formatting, stored in app_settings.documentNumbering like any other setting.

CREATE TABLE IF NOT EXISTS document_number_sequences (
  doc_type    TEXT    NOT NULL,
  -- The calendar year as text when the sequence resets yearly, or the literal 'ALL' for a
  -- single continuous sequence that never resets. Just a partition key, not a real date.
  period_key  TEXT    NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, period_key)
);

ALTER TABLE document_number_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON document_number_sequences FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Atomic "give me the next number" — the ON CONFLICT branch takes Postgres's row-level lock on
-- the (doc_type, period_key) row, so two concurrent callers can never receive the same value.
-- p_start only matters the very first time a (doc_type, period_key) pair is seen (e.g. a shop
-- continuing their old system's numbering from 501 instead of 1) -- every call after that just
-- increments by 1 regardless of p_start.
CREATE OR REPLACE FUNCTION next_document_number(p_doc_type TEXT, p_period_key TEXT, p_start INTEGER DEFAULT 1)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO document_number_sequences (doc_type, period_key, last_number)
    VALUES (p_doc_type, p_period_key, p_start)
  ON CONFLICT (doc_type, period_key)
    DO UPDATE SET last_number = document_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION next_document_number(TEXT, TEXT, INTEGER) TO authenticated;
