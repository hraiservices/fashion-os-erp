import { describe, it, expect } from "vitest";
import {
  deriveBalance,
  dueBadge,
  daysLeft,
  computeRedemption,
  computeEarnPoints,
  deliveryBonusPoints,
  loyaltyTier,
  getNextStage,
  normalizeIndianMobile,
  loyaltyDiscountOf,
  DEFAULT_LOYALTY_CONFIG,
} from "@/lib/business-rules";
import { istDateString } from "@/lib/ist-date";

// IST calendar date `days` from now, computed the same UTC-anchored way daysLeft() itself uses
// — the previous version (`new Date(); setDate(); toISOString().slice()`) mixed a
// local-timezone day-add with a UTC read-back, so it silently landed on the wrong calendar day
// whenever the test runner's local timezone wasn't UTC-aligned with where the offset crossed
// midnight, making this test fail depending solely on the machine's timezone.
function isoDateOffset(days: number): string {
  return istDateString(new Date(Date.now() + days * 86_400_000));
}

describe("deriveBalance", () => {
  it("is always total minus advance, floored at 0", () => {
    expect(deriveBalance(1400, 600)).toBe(800);
    expect(deriveBalance(1400, 1400)).toBe(0);
    // Never goes negative even if advance somehow exceeds total.
    expect(deriveBalance(1000, 1500)).toBe(0);
  });
});

describe("dueBadge", () => {
  it("returns null once an order is delivered or paid — no due-date pressure anymore", () => {
    expect(dueBadge({ status: "delivered", deliveryDate: isoDateOffset(-10) })).toBeNull();
    expect(dueBadge({ status: "payment", deliveryDate: isoDateOffset(-10) })).toBeNull();
  });

  it("flags overdue orders with the days-overdue count", () => {
    const badge = dueBadge({ status: "stitching", deliveryDate: isoDateOffset(-3) });
    expect(badge?.urgent).toBe(true);
    expect(badge?.text).toBe("3d OVERDUE");
  });

  it("flags an order due today distinctly from a future order", () => {
    expect(dueBadge({ status: "cutting", deliveryDate: isoDateOffset(0) })).toMatchObject({ text: "Due TODAY!", urgent: true });
    expect(dueBadge({ status: "cutting", deliveryDate: isoDateOffset(1) })).toMatchObject({ text: "Due tmr", urgent: false });
    expect(dueBadge({ status: "cutting", deliveryDate: isoDateOffset(5) })).toMatchObject({ text: "5d left", urgent: false });
  });
});

describe("daysLeft", () => {
  it("is 0 for today and negative for a past date", () => {
    expect(daysLeft(isoDateOffset(0))).toBe(0);
    expect(daysLeft(isoDateOffset(-7))).toBe(-7);
    expect(daysLeft(isoDateOffset(7))).toBe(7);
  });
});

describe("getNextStage", () => {
  it("walks the fixed stage order and stops at the last stage", () => {
    expect(getNextStage("received")).toBe("cutting");
    expect(getNextStage("cutting")).toBe("stitching");
    expect(getNextStage("stitching")).toBe("ready");
    expect(getNextStage("ready")).toBe("delivered");
    expect(getNextStage("delivered")).toBe("payment");
    expect(getNextStage("payment")).toBeNull();
  });

  it("returns null for an unrecognized status rather than throwing", () => {
    expect(getNextStage("trial")).toBeNull();
    expect(getNextStage("")).toBeNull();
  });
});

describe("loyaltyTier", () => {
  it("buckets by lifetime points earned against the default thresholds", () => {
    expect(loyaltyTier(0).label).toBe("Bronze");
    expect(loyaltyTier(499).label).toBe("Bronze");
    expect(loyaltyTier(500).label).toBe("Silver");
    expect(loyaltyTier(1999).label).toBe("Silver");
    expect(loyaltyTier(2000).label).toBe("Gold");
    expect(loyaltyTier(4999).label).toBe("Gold");
    expect(loyaltyTier(5000).label).toBe("Platinum");
  });
});

describe("computeEarnPoints", () => {
  it("is floor(total/100) * earnPer100 + orderBonus", () => {
    // floor(1400/100)=14 * 5 + 10 = 80
    expect(computeEarnPoints(1400)).toBe(80);
    // amounts under 100 still earn the flat order bonus
    expect(computeEarnPoints(50)).toBe(10);
    expect(computeEarnPoints(0)).toBe(10);
  });
});

describe("deliveryBonusPoints", () => {
  it("returns the configured delivery bonus", () => {
    expect(deliveryBonusPoints()).toBe(DEFAULT_LOYALTY_CONFIG.deliveryBonus);
    expect(deliveryBonusPoints({ ...DEFAULT_LOYALTY_CONFIG, deliveryBonus: 50 })).toBe(50);
  });
});

describe("computeRedemption", () => {
  it("cannot redeem below the minimum points threshold", () => {
    expect(computeRedemption(99, 1000)).toEqual({ canRedeem: false, maxPtDiscount: 0, ptsToRedeem: 0 });
  });

  it("caps the discount at the order balance, not the full point value", () => {
    // 300 pts -> floor(300/100)*10 = 30 max discount, but balance only allows 25.
    const r = computeRedemption(300, 25);
    expect(r.canRedeem).toBe(true);
    expect(r.maxPtDiscount).toBe(25);
  });

  it("rounds points spent UP to the nearest 100-pt block even when the discount is capped to a non-multiple — the intentional floor/ceil asymmetry", () => {
    // This is the exact scenario the business-rules.ts doc comment warns about:
    // balance-capping the discount to ₹25 still consumes a full 300 pts, not 250.
    const r = computeRedemption(300, 25);
    expect(r.ptsToRedeem).toBe(300);
  });

  it("uncapped redemption spends exactly the points that fund the discount", () => {
    // 250 pts -> floor(250/100)*10 = 20 discount, uncapped by a large balance.
    const r = computeRedemption(250, 1000);
    expect(r.maxPtDiscount).toBe(20);
    expect(r.ptsToRedeem).toBe(200);
  });
});

describe("loyaltyDiscountOf", () => {
  it("sums 🎁 ₹N loyalty-discount amounts out of free-text history lines", () => {
    const order = {
      history: ["📥 Received — 01 Jan by user", "💰 Payment ₹500 via Cash + 🎁 ₹20 loyalty pts — 02 Jan", "💰 Payment ₹300 via UPI + 🎁 ₹10 loyalty pts — 03 Jan"],
    };
    expect(loyaltyDiscountOf(order)).toBe(30);
  });

  it("is 0 when there were no loyalty-point discounts", () => {
    expect(loyaltyDiscountOf({ history: ["📥 Received — 01 Jan by user"] })).toBe(0);
    expect(loyaltyDiscountOf({})).toBe(0);
  });
});

describe("normalizeIndianMobile", () => {
  it("strips a leading +91 or 91 prefix without touching a bare 10-digit number", () => {
    expect(normalizeIndianMobile("+919876543210")).toBe("9876543210");
    expect(normalizeIndianMobile("919876543210")).toBe("9876543210");
    expect(normalizeIndianMobile("9876543210")).toBe("9876543210");
  });
});
