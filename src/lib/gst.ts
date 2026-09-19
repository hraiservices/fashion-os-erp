// GST computation shared by Purchase Bills and (later) Sales Invoices.
// Both CGST/SGST (intra-state) and IGST (inter-state) are supported per business decision —
// which one applies is a manual choice on the document, not auto-derived from addresses.

export type GstType = "none" | "intra" | "inter";

export interface GstBreakdown {
  taxableAmount: number;
  gstType: GstType;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  total: number;
}

/**
 * Intra-state splits the rate evenly into CGST + SGST; inter-state charges the full rate
 * as IGST; "none" charges no tax at all. Rounded to paise (2 decimals) at the end only —
 * intermediate math stays unrounded to avoid compounding rounding error.
 */
export function computeGst(taxableAmount: number, taxRatePercent: number, gstType: GstType): GstBreakdown {
  const taxable = taxableAmount || 0;
  const rate = taxRatePercent || 0;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (gstType === "intra") {
    cgst = (taxable * rate) / 2 / 100;
    sgst = (taxable * rate) / 2 / 100;
  } else if (gstType === "inter") {
    igst = (taxable * rate) / 100;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Round each displayed component first, THEN sum those rounded values for totalTax/total —
  // summing the unrounded values instead (the previous behavior) could make the printed
  // CGST + SGST + IGST fail to add up to the printed total tax by a paisa on some rates/amounts.
  // Rounding once, consistently, from the numbers actually shown, keeps the invoice internally
  // consistent even though it means totalTax is no longer bit-for-bit round(cgst+sgst+igst) in
  // unrounded-math terms — the displayed numbers are the ones that must reconcile, not the raw ones.
  const cgstR = round2(cgst);
  const sgstR = round2(sgst);
  const igstR = round2(igst);
  const totalTax = round2(cgstR + sgstR + igstR);

  return {
    taxableAmount: round2(taxable),
    gstType,
    taxRate: rate,
    cgst: cgstR,
    sgst: sgstR,
    igst: igstR,
    totalTax,
    total: round2(round2(taxable) + totalTax),
  };
}

export const GST_TYPE_LABELS: Record<GstType, string> = {
  none: "No GST",
  intra: "Intra-state (CGST + SGST)",
  inter: "Inter-state (IGST)",
};
