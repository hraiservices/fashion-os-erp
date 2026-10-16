import { describe, expect, it } from "vitest";
import { computePurchaseTotal } from "./purchases";
import { computeGst } from "./gst";

describe("computePurchaseTotal", () => {
  it("adds shipping and other charges after GST, with no GST on them", () => {
    const gst = computeGst(28_680, 5, "intra");
    expect(gst.total).toBe(30_114);
    expect(computePurchaseTotal(gst.total, 500, 250)).toBe(30_864);
    // GST and taxable amount are untouched by the charges.
    expect(gst.taxableAmount).toBe(28_680);
  });
  it("is the plain total when there are no charges", () => {
    expect(computePurchaseTotal(1_000, 0, 0)).toBe(1_000);
  });
  it("ignores negative or missing charges and rounds to paise", () => {
    expect(computePurchaseTotal(100, -50, Number.NaN)).toBe(100);
    expect(computePurchaseTotal(100.005, 0.004, 0)).toBe(100.01);
  });
});
