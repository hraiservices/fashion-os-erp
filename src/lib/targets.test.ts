import { describe, it, expect } from "vitest";
import {
  buildLeaderboard,
  computeProgress,
  dailyTargetFor,
  describeTarget,
  formatMetricValue,
  formatWinRate,
  incentiveFor,
  lostReasonStats,
  monthRange,
  pipelineSummary,
  saleContribution,
  sourceStats,
  winRate,
  type LeadFact,
  type SaleFact,
  type TargetDef,
} from "./targets";

const target = (over: Partial<TargetDef> = {}): TargetDef => ({
  id: "t1",
  title: "September sales",
  metric: "sales_value",
  targetValue: 100_000,
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  scope: "person",
  assigneeIds: ["asha"],
  productIds: [],
  garmentTypes: [],
  statusOverride: null,
  ...over,
});

const sale = (over: Partial<SaleFact> = {}): SaleFact => ({
  kind: "invoice",
  id: "s",
  date: "2026-09-10",
  personId: "asha",
  value: 10_000,
  lines: [{ productId: "p1", qty: 2, amount: 10_000 }],
  ...over,
});

const lead = (over: Partial<LeadFact> = {}): LeadFact => ({
  id: "l",
  stage: "new",
  assignedEmployeeId: "asha",
  expectedValue: 5_000,
  likelyToClose: false,
  wonValue: 0,
  wonDate: null,
  ...over,
});

describe("saleContribution — credit and scope", () => {
  it("counts a sale credited to an assignee", () => {
    expect(saleContribution(sale(), target())).toBe(10_000);
  });
  it("ignores a sale credited to someone else or to nobody on a person target", () => {
    expect(saleContribution(sale({ personId: "ravi" }), target())).toBe(0);
    expect(saleContribution(sale({ personId: null }), target())).toBe(0);
  });
  it("counts everything on a shop-wide target, credited or not", () => {
    expect(saleContribution(sale({ personId: null }), target({ scope: "shop", assigneeIds: [] }))).toBe(10_000);
  });
  it("only counts sales inside the date range, inclusive of both ends", () => {
    expect(saleContribution(sale({ date: "2026-08-31" }), target())).toBe(0);
    expect(saleContribution(sale({ date: "2026-09-01" }), target())).toBe(10_000);
    expect(saleContribution(sale({ date: "2026-09-30" }), target())).toBe(10_000);
    expect(saleContribution(sale({ date: "2026-10-01" }), target())).toBe(0);
  });
});

describe("saleContribution — product and garment filters", () => {
  it("sums only matching invoice lines for a product-filtered ₹ target", () => {
    const s = sale({
      value: 15_000,
      lines: [
        { productId: "p1", qty: 1, amount: 10_000 },
        { productId: "p2", qty: 1, amount: 5_000 },
      ],
    });
    expect(saleContribution(s, target({ productIds: ["p1"] }))).toBe(10_000);
  });
  it("counts orders by garment type, case-insensitively", () => {
    const o = sale({ kind: "order", value: 30_000, lines: [{ garmentType: "Lehenga", qty: 1, amount: 22_000 }, { garmentType: "Blouse", qty: 1, amount: 8_000 }] });
    expect(saleContribution(o, target({ garmentTypes: ["lehenga"] }))).toBe(22_000);
  });
  it("gives other kinds of sale nothing when only one kind of filter is set", () => {
    const inv = sale();
    const ord = sale({ kind: "order", lines: [{ garmentType: "Lehenga", qty: 1, amount: 5_000 }], value: 5_000 });
    expect(saleContribution(ord, target({ productIds: ["p1"] }))).toBe(0);
    expect(saleContribution(inv, target({ garmentTypes: ["Lehenga"] }))).toBe(0);
  });
  it("counts pieces for the units metric", () => {
    const t = target({ metric: "units", targetValue: 20, productIds: ["p1"] });
    expect(saleContribution(sale(), t)).toBe(2);
  });
  it("counts a sale once for the order-count metric, only if it matches the filter", () => {
    expect(saleContribution(sale(), target({ metric: "order_count", targetValue: 10 }))).toBe(1);
    expect(saleContribution(sale(), target({ metric: "order_count", targetValue: 10, productIds: ["other"] }))).toBe(0);
  });
});

describe("computeProgress — status and pace", () => {
  const sales = [sale({ value: 30_000 })];

  it("is on track when at or above 90% of the pro-rata line", () => {
    // day 11 of 30 → 10 completed days → expected 33,333; 30,000 ≥ 90% of that
    const p = computeProgress(target(), sales, [], "2026-09-11");
    expect(p.status).toBe("on_track");
    expect(p.achieved).toBe(30_000);
    expect(p.daysLeft).toBe(19);
  });
  it("is behind pace when well under the line", () => {
    const p = computeProgress(target(), [sale({ value: 5_000 })], [], "2026-09-20");
    expect(p.status).toBe("at_risk");
  });
  it("is never behind on the first day (today is still in progress)", () => {
    expect(computeProgress(target(), [], [], "2026-09-01").status).toBe("on_track");
  });
  it("is upcoming before the start date", () => {
    expect(computeProgress(target(), [], [], "2026-08-20").status).toBe("upcoming");
  });
  it("is achieved at or over the goal, even early", () => {
    const p = computeProgress(target(), [sale({ value: 120_000 })], [], "2026-09-05");
    expect(p.status).toBe("achieved");
    expect(p.pct).toBeCloseTo(120);
  });
  it("is missed after the end date if not reached", () => {
    const p = computeProgress(target(), [sale({ value: 40_000 })], [], "2026-10-02");
    expect(p.status).toBe("missed");
    expect(p.remaining).toBe(60_000);
  });
  it("honours a manual override", () => {
    expect(computeProgress(target({ statusOverride: "cancelled" }), sales, [], "2026-09-11").status).toBe("cancelled");
    expect(computeProgress(target({ statusOverride: "draft" }), sales, [], "2026-09-11").status).toBe("draft");
  });
  it("projects the final figure at the current pace", () => {
    const p = computeProgress(target(), [sale({ value: 30_000 })], [], "2026-09-10"); // 10 days elapsed
    expect(Math.round(p.projected)).toBe(90_000);
  });
  it("breaks the credit down by person, biggest first", () => {
    const t = target({ assigneeIds: ["asha", "ravi"] });
    const p = computeProgress(t, [sale({ value: 10_000 }), sale({ personId: "ravi", value: 25_000 })], [], "2026-09-15");
    expect(p.byPerson).toEqual([
      { personId: "ravi", value: 25_000 },
      { personId: "asha", value: 10_000 },
    ]);
  });
});

describe("computeProgress — leads won and 'likely to close'", () => {
  it("counts Won leads inside the range for the owner", () => {
    const t = target({ metric: "leads_won", targetValue: 5 });
    const leads = [
      lead({ id: "a", stage: "won", wonDate: "2026-09-04" }),
      lead({ id: "b", stage: "won", wonDate: "2026-08-30" }),
      lead({ id: "c", stage: "won", wonDate: "2026-09-08", assignedEmployeeId: "ravi" }),
      lead({ id: "d", stage: "talking" }),
    ];
    expect(computeProgress(t, [], leads, "2026-09-10").achieved).toBe(1);
  });
  it("adds starred open leads to the forecast for a ₹ target", () => {
    const leads = [
      lead({ id: "a", likelyToClose: true, expectedValue: 20_000, stage: "quoted" }),
      lead({ id: "b", likelyToClose: false, expectedValue: 90_000 }),
      lead({ id: "c", likelyToClose: true, expectedValue: 9_999, stage: "lost" }),
      lead({ id: "d", likelyToClose: true, expectedValue: 7_000, assignedEmployeeId: "ravi" }),
    ];
    const p = computeProgress(target(), [sale({ value: 30_000 })], leads, "2026-09-12");
    expect(p.likely).toBe(20_000);
    expect(p.forecast).toBe(50_000);
  });
  it("counts starred leads as a number for a leads-won target", () => {
    const t = target({ metric: "leads_won", targetValue: 5 });
    const p = computeProgress(t, [], [lead({ likelyToClose: true }), lead({ id: "x", likelyToClose: true })], "2026-09-12");
    expect(p.likely).toBe(2);
  });
});

describe("formatting", () => {
  it("formats ₹ and plain counts", () => {
    expect(formatMetricValue("sales_value", 100000)).toBe("₹1,00,000");
    expect(formatMetricValue("units", 1234)).toBe("1,234");
  });
  it("reads a target as a sentence", () => {
    const p = computeProgress(target(), [sale({ value: 5_000 })], [], "2026-09-22");
    const d = describeTarget("sales_value", p);
    expect(d.headline).toBe("₹5,000 of ₹1,00,000");
    expect(d.detail).toBe("8 days left · behind pace");
  });
  it("gives the month for a date", () => {
    expect(monthRange("2026-02-14")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRange("2026-09-14")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  });
});

describe("leaderboard", () => {
  it("ranks people by credited value in the window and keeps Won value separate", () => {
    const rows = buildLeaderboard(
      [sale({ value: 10_000 }), sale({ personId: "ravi", value: 30_000 }), sale({ date: "2026-08-01", value: 99_999 })],
      [lead({ stage: "won", wonDate: "2026-09-05", wonValue: 7_000 })],
      { start: "2026-09-01", end: "2026-09-30" }
    );
    expect(rows.map((r) => r.personId)).toEqual(["ravi", "asha"]);
    expect(rows[1]).toMatchObject({ value: 10_000, sales: 1, leadsWon: 1, wonValue: 7_000 });
  });
});

describe("pipeline, win rate, sources, lost reasons", () => {
  const leads: LeadFact[] = [
    lead({ id: "1", stage: "new", expectedValue: 1000, source: "Instagram", createdDate: "2026-09-01" }),
    lead({ id: "2", stage: "quoted", expectedValue: 4000, likelyToClose: true, source: "Instagram" }),
    lead({ id: "3", stage: "won", source: "Instagram", createdDate: "2026-09-01", wonDate: "2026-09-11" }),
    lead({ id: "4", stage: "lost", source: "Walk-in", lostReason: "Price too high" }),
    lead({ id: "5", stage: "lost", source: "Walk-in", lostReason: "Price too high" }),
    lead({ id: "6", stage: "lost", lostReason: "" }),
  ];
  it("summarises open leads per stage", () => {
    const p = pipelineSummary(leads, ["new", "talking", "visit", "quoted"]);
    expect(p.openCount).toBe(2);
    expect(p.openValue).toBe(5000);
    expect(p.likelyValue).toBe(4000);
    expect(p.rows.find((r) => r.stage === "quoted")).toMatchObject({ count: 1, value: 4000 });
  });
  it("computes win rate from decided leads only", () => {
    expect(winRate(leads)).toBe(25); // 1 won, 3 lost
    expect(winRate([lead()])).toBeNull();
  });
  it("breaks conversion down by source with days to win", () => {
    const rows = sourceStats(leads);
    const insta = rows.find((r) => r.source === "Instagram")!;
    expect(insta).toMatchObject({ total: 3, won: 1, open: 2, winRate: 100, avgDaysToWin: 10 });
    expect(rows.find((r) => r.source === "Not recorded")).toBeTruthy();
  });
  it("groups lost reasons", () => {
    expect(lostReasonStats(leads)).toEqual([
      { reason: "Price too high", count: 2 },
      { reason: "Not recorded", count: 1 },
    ]);
  });
});

describe("incentiveFor", () => {
  it("applies percent of credited value", () => {
    expect(incentiveFor("percent_of_sales", 5, { value: 80_000, sales: 4 })).toBe(4_000);
  });
  it("applies a flat amount per credited sale", () => {
    expect(incentiveFor("flat_per_order", 200, { value: 80_000, sales: 4 })).toBe(800);
  });
  it("is zero when no commission is set", () => {
    expect(incentiveFor("none", 10, { value: 80_000, sales: 4 })).toBe(0);
  });
});

describe("dailyTargetFor", () => {
  const shop = (over: Partial<TargetDef> = {}) => target({ scope: "shop", assigneeIds: [], targetValue: 300_000, ...over });

  it("spreads a shop-wide sales target evenly over its days", () => {
    expect(dailyTargetFor([shop()], "2026-09-10")).toEqual({ value: 10_000, title: "September sales" });
  });

  it("ignores person, filtered, draft/cancelled and out-of-range targets", () => {
    expect(dailyTargetFor([target()], "2026-09-10")).toBeNull();
    expect(dailyTargetFor([shop({ productIds: ["p1"] })], "2026-09-10")).toBeNull();
    expect(dailyTargetFor([shop({ statusOverride: "cancelled" })], "2026-09-10")).toBeNull();
    expect(dailyTargetFor([shop()], "2026-10-01")).toBeNull();
    expect(dailyTargetFor([shop({ metric: "order_count" })], "2026-09-10")).toBeNull();
  });
});

describe("formatWinRate", () => {
  it("shows the whole-percent rate as it is — 50 means 50%, not 5000%", () => {
    expect(formatWinRate(winRate([{ stage: "won" }, { stage: "lost" }]))).toBe("50%");
    expect(formatWinRate(winRate([{ stage: "won" }, { stage: "won" }, { stage: "lost" }]))).toBe("67%");
    expect(formatWinRate(100)).toBe("100%");
  });
  it("shows a dash when nothing has been decided yet", () => {
    expect(formatWinRate(winRate([{ stage: "new" }]))).toBe("–");
    expect(formatWinRate(null)).toBe("–");
  });
});
