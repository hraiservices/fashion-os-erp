import { describe, it, expect } from "vitest";
import { computeGst } from "@/lib/gst";

describe("computeGst", () => {
  it("splits intra-state tax evenly into CGST + SGST", () => {
    const b = computeGst(1000, 18, "intra");
    expect(b.cgst).toBe(90);
    expect(b.sgst).toBe(9 * 10);
    expect(b.igst).toBe(0);
    expect(b.totalTax).toBe(180);
    expect(b.total).toBe(1180);
  });

  it("charges the full rate as IGST for inter-state", () => {
    const b = computeGst(1000, 18, "inter");
    expect(b.igst).toBe(180);
    expect(b.cgst).toBe(0);
    expect(b.sgst).toBe(0);
    expect(b.totalTax).toBe(180);
    expect(b.total).toBe(1180);
  });

  it("charges no tax when gstType is none", () => {
    const b = computeGst(1000, 18, "none");
    expect(b.cgst).toBe(0);
    expect(b.sgst).toBe(0);
    expect(b.igst).toBe(0);
    expect(b.totalTax).toBe(0);
    expect(b.total).toBe(1000);
  });

  it("treats missing/zero taxableAmount and rate as zero, not NaN", () => {
    const b = computeGst(0, 0, "intra");
    expect(b.total).toBe(0);
    expect(Number.isNaN(b.total)).toBe(false);
  });

  it("keeps the displayed CGST+SGST breakdown internally consistent with totalTax on odd amounts", () => {
    // A taxable amount/rate combination whose unrounded CGST/SGST each carry a third decimal —
    // summing the *rounded* per-component values (not the unrounded ones) for totalTax is what
    // guarantees cgst + sgst always equals totalTax exactly on the printed invoice.
    const b = computeGst(333.33, 18, "intra");
    expect(b.cgst + b.sgst).toBeCloseTo(b.totalTax, 5);
    expect(b.taxableAmount + b.totalTax).toBeCloseTo(b.total, 5);
  });

  it("rounds every field to at most 2 decimal places (paise)", () => {
    const b = computeGst(999.995, 18.5, "inter");
    for (const n of [b.taxableAmount, b.igst, b.totalTax, b.total]) {
      expect(Math.round(n * 100)).toBe(n * 100);
    }
  });
});
