// Money apportionment for the "one order per garment" split (see order-form.tsx's
// submitSplitOrders). Splitting an order's advance across N new sibling orders by each piece's
// share of the total has to reconcile EXACTLY back to the original amount entered — silently
// losing or inventing a rupee to rounding would be a real, if small, accounting error repeated
// on every split order ever created.

/**
 * Splits `amount` across `shares` (each piece's own value, e.g. garment price) proportionally,
 * rounding every entry but the last to the nearest rupee, and putting whatever rounding
 * leftover remains onto the last entry — so `sum(result) === Math.round(amount)` always, exactly,
 * regardless of how the individual shares round. Returns `[]` for an empty `shares` array, and
 * splits evenly (ignoring the share values) if every share is zero — the same as they'd want an
 * ambiguous 0-priced set of garments split before anything makes it non-ambiguous.
 */
export function apportionAmount(amount: number, shares: number[]): number[] {
  if (shares.length === 0) return [];
  const rounded = Math.round(amount);
  const totalShare = shares.reduce((s, v) => s + v, 0);
  const out: number[] = [];
  let remaining = rounded;
  for (let i = 0; i < shares.length; i++) {
    const isLast = i === shares.length - 1;
    if (isLast) {
      out.push(remaining);
      break;
    }
    const fraction = totalShare > 0 ? shares[i] / totalShare : 1 / shares.length;
    const piece = Math.round(rounded * fraction);
    // Never hand out more than what's left, even if rounding overshoots on an earlier entry —
    // keeps every entry non-negative and the running total from ever going negative before the
    // final "whatever's left" entry.
    const capped = Math.max(0, Math.min(piece, remaining));
    out.push(capped);
    remaining -= capped;
  }
  return out;
}
