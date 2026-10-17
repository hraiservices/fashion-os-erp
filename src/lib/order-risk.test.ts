import { describe, expect, it } from "vitest";
import { orderRisks } from "./order-risk";
import { upcomingFestival } from "./festivals";
import { buildWinModel, winChance, type ClosedLead } from "./win-chance";

const o = (status: string, delivery_date: string) => ({ id: "1", name: "A", status, delivery_date });

describe("orderRisks", () => {
  it("flags late and tight orders, ignores safe and finished ones", () => {
    const r = orderRisks([o("cutting", "2026-10-12"), o("stitching", "2026-10-09"), o("ready", "2026-10-10"), o("delivered", "2026-10-01"), o("received", "2026-10-30")], "2026-10-10");
    expect(r.map((x) => x.level)).toEqual(["late", "tight"]);
  });
});

describe("upcomingFestival", () => {
  it("returns the nearest festival inside the window", () => {
    expect(upcomingFestival("2026-10-10")?.name).toBe("Navratri");
    expect(upcomingFestival("2026-06-01")).toBeNull();
  });
});

describe("winChance", () => {
  const mk = (stage: string, source: string): ClosedLead => ({ stage, source, outfitType: "", budgetMax: 0, expectedValue: 0, neededBy: null });
  it("needs enough closed leads", () => {
    expect(winChance(buildWinModel([mk("won", "Instagram")]), mk("new", "Instagram"))).toBeNull();
  });
  it("favours sources that won more often", () => {
    const leads = [...Array(15).fill(0).map(() => mk("won", "Referral")), ...Array(15).fill(0).map(() => mk("lost", "Walk-in"))];
    const model = buildWinModel(leads);
    expect(winChance(model, mk("new", "Referral"))!.pct).toBeGreaterThan(winChance(model, mk("new", "Walk-in"))!.pct);
  });
});
