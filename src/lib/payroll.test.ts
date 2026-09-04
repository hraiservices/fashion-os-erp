import { describe, it, expect } from "vitest";
import { computeGrossPay, partitionBulkAdvances } from "@/lib/payroll";

describe("computeGrossPay — monthly salary", () => {
  it("pays the full monthly rate for a full, fully-attended calendar month", () => {
    const gross = computeGrossPay(
      { salaryType: "monthly", salaryRate: 30000 },
      "2026-09-01",
      "2026-09-30",
      { presentDays: 30, absentDays: 0, halfDays: 0, leaveDays: 0 }
    );
    expect(gross).toBe(30000);
  });

  it("prorates a short payroll period to its share of the calendar month, not the full salary", () => {
    // The bug this guards against: a 4-day run with zero recorded absences previously paid the
    // employee their ENTIRE monthly salary (₹1,50,000 for 4 days), because the old formula
    // divided the rate by the period's own length rather than the month's.
    const gross = computeGrossPay(
      { salaryType: "monthly", salaryRate: 150000 },
      "2026-09-01",
      "2026-09-04", // September has 30 days
      { presentDays: 4, absentDays: 0, halfDays: 0, leaveDays: 0 }
    );
    expect(gross).toBeCloseTo((150000 / 30) * 4, 2);
    expect(gross).toBeLessThan(150000);
  });

  it("still deducts absent/leave days within a short period", () => {
    const gross = computeGrossPay(
      { salaryType: "monthly", salaryRate: 30000 },
      "2026-09-01",
      "2026-09-04",
      { presentDays: 2, absentDays: 1, halfDays: 1, leaveDays: 0 }
    );
    // 4-day period, 1 absent + 0.5 half-day = 1.5 unpaid-day-equivalents → 2.5 paid days.
    expect(gross).toBeCloseTo((30000 / 30) * 2.5, 2);
  });

  it("never goes negative when unpaid days exceed the period length", () => {
    const gross = computeGrossPay(
      { salaryType: "monthly", salaryRate: 30000 },
      "2026-09-01",
      "2026-09-02",
      { presentDays: 0, absentDays: 5, halfDays: 0, leaveDays: 0 }
    );
    expect(gross).toBe(0);
  });

  it("uses the month periodStart falls in, including a shorter February", () => {
    const gross = computeGrossPay(
      { salaryType: "monthly", salaryRate: 28000 },
      "2026-02-01",
      "2026-02-04",
      { presentDays: 4, absentDays: 0, halfDays: 0, leaveDays: 0 }
    );
    expect(gross).toBeCloseTo((28000 / 28) * 4, 2);
  });
});

describe("computeGrossPay — daily/hourly salary", () => {
  it("pays only for attended days, unaffected by the period's overall length", () => {
    const gross = computeGrossPay({ salaryType: "daily", salaryRate: 500 }, "2026-09-01", "2026-09-04", {
      presentDays: 3,
      absentDays: 1,
      halfDays: 0,
      leaveDays: 0,
    });
    expect(gross).toBe(1500);
  });

  it("counts a half day as half a day's rate", () => {
    const gross = computeGrossPay({ salaryType: "daily", salaryRate: 500 }, "2026-09-01", "2026-09-04", {
      presentDays: 2,
      absentDays: 0,
      halfDays: 2,
      leaveDays: 0,
    });
    expect(gross).toBe(500 * 3);
  });
});

describe("partitionBulkAdvances", () => {
  it("lets a salaried employee through with no cap at all", () => {
    const { valid, skipped } = partitionBulkAdvances(
      [{ employeeId: "e1", amount: 100000 }],
      new Set(),
      new Map()
    );
    expect(valid).toEqual([{ employeeId: "e1", amount: 100000 }]);
    expect(skipped).toEqual([]);
  });

  it("allows a piece-rate employee's entry when it's within their cap", () => {
    const { valid, skipped } = partitionBulkAdvances(
      [{ employeeId: "e1", amount: 500 }],
      new Set(["e1"]),
      new Map([["e1", 800]])
    );
    expect(valid).toEqual([{ employeeId: "e1", amount: 500 }]);
    expect(skipped).toEqual([]);
  });

  it("skips a piece-rate employee's entry when it exceeds their cap, without touching others", () => {
    const { valid, skipped } = partitionBulkAdvances(
      [
        { employeeId: "e1", amount: 900 },
        { employeeId: "e2", amount: 200 },
      ],
      new Set(["e1"]),
      new Map([["e1", 800]])
    );
    expect(valid).toEqual([{ employeeId: "e2", amount: 200 }]);
    expect(skipped).toEqual([{ employeeId: "e1", reason: "Exceeds this tailor's ₹800 piece-rate advance cap" }]);
  });

  it("fails closed to a ₹0 cap when a piece-rate employee has no computed cap entry", () => {
    const { valid, skipped } = partitionBulkAdvances([{ employeeId: "e1", amount: 1 }], new Set(["e1"]), new Map());
    expect(valid).toEqual([]);
    expect(skipped).toEqual([{ employeeId: "e1", reason: "Exceeds this tailor's ₹0 piece-rate advance cap" }]);
  });
});
