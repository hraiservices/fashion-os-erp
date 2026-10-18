import { describe, expect, it } from "vitest";
import { seasonalRushDays } from "./analytics";

const mk = (dates: string[]) => dates.map((inDate) => ({ inDate }));
const spread = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (i % 300));
  return d.toISOString().slice(0, 10);
});

describe("seasonalRushDays", () => {
  it("returns 0 without enough history", () => {
    expect(seasonalRushDays(mk(["2025-10-12", "2025-10-13"]), "2026-10-12")).toEqual({ extraDays: 0, ratio: 0 });
  });
  it("adds days when the same window last year was much busier than average", () => {
    const quiet = spread("2025-10-30", 60); // spread over the rest of the year
    const rush = Array.from({ length: 40 }, (_, i) => `2025-10-${String(12 + (i % 9)).padStart(2, "0")}`);
    const r = seasonalRushDays(mk([...quiet, ...rush]), "2026-10-12");
    expect(r.extraDays).toBeGreaterThanOrEqual(2);
  });
});
