// Fabric requirement estimation — unlike the delivery-date/rework-risk/reorder estimators,
// there's no historical data to learn from here: stitching orders record a ₹ fabricCost, never
// a meters-consumed figure (that only exists for Manufacturing's inventory_ledger work orders,
// a separate module). So this is a configurable reference table (standard tailoring yardage per
// garment type, editable per shop) rather than something computed from the shop's own past
// orders — an honest "typical amount for this garment type," not a learned pattern.

/** Rough standard Indian-tailoring yardage (meters) for the DEFAULT_RATES garment types, at a
 *  typical adult size — shops should adjust these to their own fabric widths/cutting style.
 *  Garment types outside this list (custom rate-card entries) start unset until the shop fills
 *  them in under Settings → Rate Card. */
export const DEFAULT_FABRIC_USAGE: Record<string, number> = {
  "Pant Suit": 3.5,
  "Pallazo Suit": 3.5,
  "Simple Suit": 3,
  "Simple Kurti": 2.5,
  Pant: 1.5,
  Pallazo: 2,
  "Simple Blouse": 1,
  "Designer Blouse": 1.25,
  Lehenga: 5,
  "Saree Fall/Piko": 0, // a finishing service on the customer's own saree, not fabric-consuming
};

export interface FabricEstimate {
  meters: number;
  /** Garment types on this order the shop hasn't set a usage figure for — when non-empty, the
   *  total above is a partial sum (missing these types), not the whole order's real need. */
  missingTypes: string[];
}

/** Sums estimated fabric across an order's garment lines. Returns null only when NONE of the
 *  garment types have a usage figure set — partial data still returns a (flagged) partial sum,
 *  since "some estimate" beats "no estimate" as long as it's clearly marked incomplete. */
export function estimateFabricRequirement(garments: { type: string; no?: number }[], usage: Record<string, number>): FabricEstimate | null {
  if (garments.length === 0) return null;

  let meters = 0;
  let anyKnown = false;
  const missingTypes = new Set<string>();

  for (const g of garments) {
    const perUnit = usage[g.type];
    if (perUnit == null) {
      missingTypes.add(g.type);
      continue;
    }
    anyKnown = true;
    meters += perUnit * (g.no || 1);
  }

  if (!anyKnown) return null;
  return { meters: Math.round(meters * 10) / 10, missingTypes: [...missingTypes] };
}
