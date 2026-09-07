import { describe, it, expect } from "vitest";
import { apportionAmount } from "@/lib/order-split";

function sum(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}

describe("apportionAmount", () => {
  it("returns an empty array for no shares", () => {
    expect(apportionAmount(1000, [])).toEqual([]);
  });

  it("always sums back to exactly the entered (rounded) amount", () => {
    // Deliberately awkward numbers that don't divide evenly — the actual bug class this exists
    // to prevent: rounding losing or inventing a rupee.
    expect(sum(apportionAmount(1000, [333, 333, 334]))).toBe(1000);
    expect(sum(apportionAmount(6000, [5000, 5000, 5000]))).toBe(6000);
    expect(sum(apportionAmount(1, [100, 100, 100]))).toBe(1);
    expect(sum(apportionAmount(999, [1, 1, 1, 1, 1, 1, 1]))).toBe(999);
  });

  it("splits proportionally to each share's weight, not evenly", () => {
    // Suit ₹5000, Shirt ₹1000 — a ₹1200 advance should weight heavily toward the suit.
    const result = apportionAmount(1200, [5000, 1000]);
    expect(result[0]).toBeGreaterThan(result[1]);
    expect(sum(result)).toBe(1200);
  });

  it("splits evenly when every share is zero (no price info to weight by)", () => {
    const result = apportionAmount(300, [0, 0, 0]);
    expect(sum(result)).toBe(300);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(100);
    expect(result[2]).toBe(100);
  });

  it("handles a zero amount", () => {
    expect(apportionAmount(0, [5000, 1000])).toEqual([0, 0]);
  });

  it("never returns a negative entry even with an unusual share distribution", () => {
    const result = apportionAmount(500, [1, 100000]);
    expect(result.every((v) => v >= 0)).toBe(true);
    expect(sum(result)).toBe(500);
  });

  it("a single piece gets the whole amount", () => {
    expect(apportionAmount(4321, [999])).toEqual([4321]);
  });
});
