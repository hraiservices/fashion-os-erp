import { describe, it, expect } from "vitest";
import { normalizeMethod, pctChange, summarizeByUser, emptySplit, buildEndOfDaySummary } from "./day-book-extras";
import { buildReviewFlags } from "./day-book-server";
import type { DayBookEntry } from "./day-book";

describe("normalizeMethod", () => {
  it("folds free-text methods into five buckets", () => {
    expect(normalizeMethod("Cash")).toBe("cash");
    expect(normalizeMethod("UPI")).toBe("upi");
    expect(normalizeMethod("GPay")).toBe("upi");
    expect(normalizeMethod("Credit Card")).toBe("card");
    expect(normalizeMethod("Bank Transfer")).toBe("bank");
    expect(normalizeMethod("NEFT")).toBe("bank");
    expect(normalizeMethod("barter")).toBe("other");
    expect(normalizeMethod("")).toBe("other");
    expect(normalizeMethod(null)).toBe("other");
  });
});

describe("pctChange", () => {
  it("computes percentage change", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
  });
  it("has no baseline when previous is zero and current is not", () => {
    expect(pctChange(100, 0)).toBeNull();
  });
  it("is flat when both are zero", () => {
    expect(pctChange(0, 0)).toBe(0);
  });
});

const entry = (over: Partial<DayBookEntry>): DayBookEntry => ({
  id: "e",
  time: "2026-09-01T05:00:00.000Z",
  module: "sales",
  activity: "Invoice Created",
  description: "",
  user: "asha",
  ...over,
});

describe("summarizeByUser", () => {
  it("counts entries and sums amounts per user, busiest first", () => {
    const rows = summarizeByUser([
      entry({ id: "1", user: "asha", amount: 100 }),
      entry({ id: "2", user: "ravi", amount: 50 }),
      entry({ id: "3", user: "asha", amount: 25 }),
      entry({ id: "4", user: "asha" }),
    ]);
    expect(rows).toEqual([
      { user: "asha", entries: 3, amount: 125 },
      { user: "ravi", entries: 1, amount: 50 },
    ]);
  });
});

describe("buildReviewFlags", () => {
  const base = { date: "2026-09-01", activityRows: [], creditNotes: [], vendorCredits: [], expenses: [], closing: null, entries: [] as DayBookEntry[] };

  it("flags deletions but not referral-bonus reversals", () => {
    const flags = buildReviewFlags({
      ...base,
      activityRows: [
        { id: 1, action: "🗑️ Order deleted: Sneha", order_id: "SOR-1", user_name: "asha", user_email: null },
        { id: 2, action: "Referral bonus reversed — order SOR-2 deleted", order_id: "SOR-2", user_name: "asha", user_email: null },
        { id: 3, action: "Stage changed: Received → Cutting for Raj", order_id: "SOR-3", user_name: "asha", user_email: null },
      ],
    });
    expect(flags.map((f) => f.id)).toEqual(["del-1"]);
  });

  it("flags large and backdated expenses", () => {
    const flags = buildReviewFlags({
      ...base,
      expenses: [
        { id: "a", category: "Rent", description: "", amount: 25000, date: "2026-09-01", created_at: "2026-09-01T05:00:00.000Z" },
        { id: "b", category: "Tea", description: "", amount: 40, date: "2026-08-28", created_at: "2026-09-01T05:00:00.000Z" },
        { id: "c", category: "Tea", description: "", amount: 40, date: "2026-09-01", created_at: "2026-09-01T05:00:00.000Z" },
      ],
    });
    expect(flags.map((f) => f.id).sort()).toEqual(["back-b", "bigexp-a"]);
  });

  it("flags cash variance and entries added after the day was closed", () => {
    const closing = { closeDate: "2026-09-01", openingCash: 0, expectedCash: 1000, countedCash: 900, variance: -100, note: "", closedBy: "x", closedAt: "2026-09-01T13:00:00.000Z" };
    const flags = buildReviewFlags({
      ...base,
      closing,
      entries: [entry({ id: "early", time: "2026-09-01T10:00:00.000Z" }), entry({ id: "late", time: "2026-09-01T15:00:00.000Z" })],
    });
    expect(flags.map((f) => f.id)).toEqual(["variance", "after-close"]);
    expect(flags[0].title).toBe("Cash short");
  });

  it("is empty for a clean day", () => {
    expect(buildReviewFlags(base)).toEqual([]);
  });
});

describe("buildEndOfDaySummary", () => {
  it("reports an unclosed day and the cash math", () => {
    const text = buildEndOfDaySummary({
      date: "2026-09-01",
      shopName: "Swaroop",
      sales: 1000,
      stitchingBilled: 2000,
      payments: 1500,
      expenses: 200,
      purchases: 0,
      split: { ...emptySplit(), cash: 1000, upi: 500 },
      cash: { opening: 500, cashIn: 1000, cashOut: 200, breakdown: { receipts: 1000, adjustmentsIn: 0, expenses: 200, vendorPayments: 0, advances: 0, adjustmentsOut: 0 }, expected: 1300, openingFromDate: null },
      closing: null,
      ordersCreated: 3,
      deliveredToday: 1,
      dueToday: 2,
      overdue: 0,
      unpaidOnDelivered: 0,
    });
    expect(text).toContain("Day not closed yet");
    expect(text).toContain("Cash ₹1,000");
    expect(text).toContain("UPI ₹500");
    expect(text).not.toContain("Overdue");
  });
});
