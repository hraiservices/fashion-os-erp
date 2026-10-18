import { describe, expect, it } from "vitest";
import { aggregateAmounts, aggregateOrders, cleanNumbersSpec, describeAnswer, type NumbersSpec } from "@/lib/numbers-query";

const orders = [
  { name: "Meera Shah", in_date: "2026-09-03", total: 5000, balance: 1000, garments: [{ type: "Blouse", amount: 3000 }, { type: "Lehenga", amount: 2000 }] },
  { name: "Asha Rao", in_date: "2026-09-20", total: 1800, balance: 0, garments: [{ type: "Blouse", amount: 1800 }] },
  { name: "Meera Shah", in_date: "2026-10-02", total: 2500, balance: 2500, garments: [{ type: "Suit", amount: 2500 }] },
];
const spec = (s: Partial<NumbersSpec>): NumbersSpec => ({ metric: "revenue", groupBy: "none", from: "2026-09-01", to: "2026-10-31", ...s });

describe("cleanNumbersSpec", () => {
  it("rejects unsupported questions with the AI's reason", () => {
    expect(cleanNumbersSpec({ unsupported: "I can't compare to competitors" }, "2026-10-18")).toEqual({ error: "I can't compare to competitors" });
  });
  it("falls back to this month and drops breakdowns the data can't give", () => {
    const r = cleanNumbersSpec({ metric: "collected", groupBy: "garment" }, "2026-10-18");
    expect(r).toEqual({ spec: { metric: "collected", groupBy: "none", from: "2026-10-01", to: "2026-10-18" } });
  });
  it("swaps reversed dates and rejects an unknown metric", () => {
    expect("spec" in cleanNumbersSpec({ metric: "revenue", from: "2026-10-10", to: "2026-09-10" }, "2026-10-18")).toBe(true);
    expect("error" in cleanNumbersSpec({ metric: "profit" }, "2026-10-18")).toBe(true);
  });
});

describe("aggregateOrders", () => {
  it("sums revenue and counts orders in range", () => {
    expect(aggregateOrders(orders, spec({})).total).toBe(9300);
    expect(aggregateOrders(orders, spec({ metric: "orders" })).total).toBe(3);
    expect(aggregateOrders(orders, spec({ from: "2026-10-01" })).total).toBe(2500);
  });
  it("uses garment amounts when asked about a garment", () => {
    const a = aggregateOrders(orders, spec({ garment: "blouse" }));
    expect(a.total).toBe(4800);
  });
  it("groups by month, garment and customer", () => {
    expect(aggregateOrders(orders, spec({ groupBy: "month" })).rows).toEqual([{ label: "2026-09", value: 6800 }, { label: "2026-10", value: 2500 }]);
    expect(aggregateOrders(orders, spec({ groupBy: "garment" })).rows[0]).toEqual({ label: "Blouse", value: 4800 });
    expect(aggregateOrders(orders, spec({ groupBy: "customer" })).rows[0]).toEqual({ label: "Meera Shah", value: 7500 });
  });
  it("totals what is still owed", () => {
    expect(aggregateOrders(orders, spec({ metric: "outstanding" })).total).toBe(3500);
  });
  it("filters by customer name", () => {
    expect(aggregateOrders(orders, spec({ customer: "meera" })).total).toBe(7500);
  });
});

describe("aggregateAmounts and describeAnswer", () => {
  const rows = [{ date: "2026-09-05", amount: 400, category: "Rent" }, { date: "2026-10-01", amount: 100, category: "Tea" }, { date: "2026-10-02", amount: 50, category: "Tea" }];
  it("groups expenses by category", () => {
    const a = aggregateAmounts(rows, spec({ metric: "expenses", groupBy: "category" }));
    expect(a.total).toBe(550);
    expect(a.rows[0]).toEqual({ label: "Rent", value: 400 });
  });
  it("words the answer with ₹ and the date range", () => {
    const s = spec({ metric: "expenses" });
    const d = describeAnswer(aggregateAmounts(rows, s), s);
    expect(d.headline).toContain("₹550");
    expect(d.note).toContain("Calculated from your records");
  });
});
