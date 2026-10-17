import { describe, expect, it } from "vitest";
import { buildUpiLink, isValidUpiId } from "./shop-links";

describe("shop links", () => {
  it("validates UPI ids", () => {
    expect(isValidUpiId("shop@okhdfcbank")).toBe(true);
    expect(isValidUpiId("9876543210@paytm")).toBe(true);
    expect(isValidUpiId("shop@")).toBe(false);
    expect(isValidUpiId("no at sign")).toBe(false);
  });
  it("builds a UPI link with amount and note", () => {
    const link = buildUpiLink({ upiId: "shop@okhdfcbank", upiName: "Asha Boutique" }, 1250.5, "Order A12");
    expect(link).toContain("upi://pay?");
    expect(link).toContain("pa=shop%40okhdfcbank");
    expect(link).toContain("am=1250.50");
    expect(link).toContain("tn=Order+A12");
  });
});
