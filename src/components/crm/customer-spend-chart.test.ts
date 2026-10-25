import { describe, it, expect } from "vitest";
import { buildCustomerSpendByMonth } from "./customer-spend-chart";

describe("buildCustomerSpendByMonth", () => {
  it("returns 6 months, oldest first, with zero totals when there's no history", () => {
    const months = buildCustomerSpendByMonth([], []);
    expect(months).toHaveLength(6);
    expect(months.every((m) => m.total === 0)).toBe(true);
  });

  it("buckets orders and invoices into the month they fall in", () => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    const months = buildCustomerSpendByMonth([{ inDate: thisMonth, total: 1000 }], [{ invoiceDate: thisMonth, total: 500 }]);
    expect(months[5].total).toBe(1500);
  });
});
