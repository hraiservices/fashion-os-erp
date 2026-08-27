-- One-time data repair: each garment carries its own `tailor` field (drives piece-rate pay and
-- the Daily Tailor Worksheet report), but it was only ever seeded from the order-level "Tailor"
-- dropdown once, at creation — changing the order's tailor afterward never propagated down to
-- its garments (see the order-form.tsx fix landed the same session). That left every affected
-- order's garments silently crediting whichever tailor was first in the list at creation time,
-- while the order itself correctly showed the real tailor everywhere else.
--
-- Confirmed with the owner: no order ever intentionally splits its garments across different
-- tailors, so it's safe to set every garment's tailor to match its order's tailor wherever they
-- disagree. Tailor Payable Rates are keyed by garment type/lining, not by which tailor did the
-- work, so payableAmount itself doesn't need recalculating — only the attribution was wrong.
--
-- Deliberately skips orders whose payables have already been paid out (piece_rate_paid_at set):
-- that money is settled history against a specific tailor and must not move retroactively. The
-- final SELECT lists any such orders so they can be reviewed and corrected manually in payroll
-- instead.
--
-- Safe to re-run: an order whose garments already agree with its own tailor is left untouched.
DO $$
DECLARE
  v_order RECORD;
  v_fixed JSONB;
BEGIN
  FOR v_order IN
    SELECT id, tailor, garments
    FROM orders
    WHERE COALESCE(tailor, '') <> ''
      AND piece_rate_paid_at IS NULL
      AND garments IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_order.garments) AS g
      WHERE COALESCE(g->>'tailor', '') <> v_order.tailor
    ) THEN
      SELECT jsonb_agg(g || jsonb_build_object('tailor', v_order.tailor))
      INTO v_fixed
      FROM jsonb_array_elements(v_order.garments) AS g;

      UPDATE orders SET garments = v_fixed WHERE id = v_order.id;
    END IF;
  END LOOP;
END $$;

-- Review these manually — piece-rate pay already settled under a mismatched tailor (skipped
-- above on purpose) and needs a payroll adjustment between the tailor who was paid and the one
-- who actually did the work, if they differ.
SELECT id, name, tailor AS order_tailor, garments
FROM orders
WHERE piece_rate_paid_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(garments) AS g
    WHERE COALESCE(g->>'tailor', '') <> tailor
  );
