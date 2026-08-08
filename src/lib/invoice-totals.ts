// Full invoice total pipeline: line-item subtotal (after per-line discounts) → overall
// discount → + shipping charges → GST (reusing the same engine as Bills) → round off →
// final total. Kept separate from lib/sales.ts so the simpler Quotation/Credit-Note math
// isn't forced through this heavier pipeline.
import { computeGst, type GstType } from "@/lib/gst";
import type { SalesLineItem } from "@/lib/sales";

export type DiscountType = "flat" | "percent";

export interface InvoiceTotals {
  lineSubtotal: number;
  discountAmount: number;
  shippingCharges: number;
  taxableAmount: number;
  gstType: GstType;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  preRoundTotal: number;
  roundOff: number;
  total: number;
}

export function computeInvoiceTotals(
  items: SalesLineItem[],
  shippingCharges: number,
  discountType: DiscountType,
  discountValue: number,
  taxRate: number,
  gstType: GstType
): InvoiceTotals {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const lineSubtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const discountAmount = discountType === "percent" ? round2((lineSubtotal * (discountValue || 0)) / 100) : round2(discountValue || 0);
  const taxableAmount = Math.max(0, round2(lineSubtotal - discountAmount + (shippingCharges || 0)));

  const gst = computeGst(taxableAmount, taxRate, gstType);
  const preRoundTotal = gst.total;
  const rounded = Math.round(preRoundTotal);
  const roundOff = round2(rounded - preRoundTotal);

  return {
    lineSubtotal: round2(lineSubtotal),
    discountAmount,
    shippingCharges: round2(shippingCharges || 0),
    taxableAmount,
    gstType,
    taxRate,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    preRoundTotal: round2(preRoundTotal),
    roundOff,
    total: rounded,
  };
}
