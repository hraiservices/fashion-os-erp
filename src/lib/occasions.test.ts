import { describe, expect, it } from "vitest";
import { upcomingOccasions } from "./occasions";

const c = (name: string, dob: string | null, anniversary: string | null = null) => ({ name, mobile: "9876543210", dob, anniversary });

describe("upcomingOccasions", () => {
  it("finds birthdays and anniversaries in the window, soonest first", () => {
    const r = upcomingOccasions([c("A", "1990-10-12"), c("B", "1985-10-10"), c("C", "1980-12-01", "2010-10-14"), c("D", "1999-11-30")], "2026-10-10", 7);
    expect(r.map((o) => `${o.name}:${o.kind}:${o.daysAway}`)).toEqual(["B:birthday:0", "A:birthday:2", "C:anniversary:4"]);
  });
  it("wraps over the new year", () => {
    const r = upcomingOccasions([c("E", "1990-01-03")], "2026-12-30", 7);
    expect(r[0].daysAway).toBe(4);
  });
  it("ignores customers with no dates", () => {
    expect(upcomingOccasions([c("F", null)], "2026-10-10")).toEqual([]);
  });
});
