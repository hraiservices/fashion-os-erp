-- Run this once in your Supabase SQL editor.
--
-- Fixes a real data-integrity bug: recording a payment on an order read the current
-- advance/balance in JavaScript, computed the new values, then wrote them back with a
-- plain UPDATE. Two payments recorded on the same order within the same window (two
-- devices, or a slow network retry) could race: both reads see the same starting advance,
-- so the second UPDATE overwrites the first — the history log shows both payments
-- happened, but the stored balance only reflects one.
--
-- This function does the read, increment, and cap in a single atomic UPDATE statement.
-- Postgres evaluates `advance + p_cash_paid + p_pt_discount` against the row's current
-- committed value and takes a row lock for the duration of the UPDATE, so two concurrent
-- calls against the same order are serialized rather than racing.
--
-- orders.total/advance/balance are INTEGER, orders.history is JSONB (an array of strings) —
-- `jsonb || jsonb` appends a scalar as a single new array element.
CREATE OR REPLACE FUNCTION record_order_payment(
  p_order_id TEXT,
  p_cash_paid NUMERIC,
  p_pt_discount NUMERIC,
  p_history_line TEXT
) RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE orders
  SET
    advance = LEAST(advance + p_cash_paid + p_pt_discount, total),
    balance = GREATEST(0, total - LEAST(advance + p_cash_paid + p_pt_discount, total)),
    status = CASE WHEN GREATEST(0, total - LEAST(advance + p_cash_paid + p_pt_discount, total)) = 0 THEN 'payment' ELSE status END,
    history = history || to_jsonb(p_history_line)
  WHERE id = p_order_id
  RETURNING *;
END;
$$;
