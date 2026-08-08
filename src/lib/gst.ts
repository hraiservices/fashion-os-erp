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

  const totalTax = cgst + sgst + igst;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    taxableAmount: round2(taxable),
    gstType,
    taxRate: rate,
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    totalTax: round2(totalTax),
    total: round2(taxable + totalTax),
  };
}

export const GST_TYPE_LABELS: Record<GstType, string> = {
  none: "No GST",
  intra: "Intra-state (CGST + SGST)",
  inter: "Inter-state (IGST)",
};
