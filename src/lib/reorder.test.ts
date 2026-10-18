import { describe, expect, it } from "vitest";
import { fillReorder, reorderCandidates, reorderMessage } from "@/lib/reorder";

const o = (in_date: string, mobile = "9811111111", name = "Meera Shah") => ({ name, mobile, in_date, garments: [{ type: "Blouse" }] });

describe("reorderCandidates", () => {
  const regular = [o("2026-01-10"), o("2026-03-12"), o("2026-05-14"), o("2026-07-15")]; // every ~62 days
  it("flags a regular who is due", () => {
    const r = reorderCandidates(regular, "2026-09-18");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ mobile: "9811111111", lastGarment: "Blouse", orderCount: 4 });
    expect(r[0].usualGapDays).toBeGreaterThan(55);
  });
  it("waits until close to their usual gap", () => {
    expect(reorderCandidates(regular, "2026-08-01")).toEqual([]);
  });
  it("gives up once they are far overdue", () => {
    expect(reorderCandidates(regular, "2027-03-01")).toEqual([]);
  });
  it("needs at least three occasions and ignores same-visit orders", () => {
    expect(reorderCandidates([o("2026-01-10"), o("2026-03-12")], "2026-05-20")).toEqual([]);
    expect(reorderCandidates([o("2026-01-10"), o("2026-01-12"), o("2026-01-15"), o("2026-03-12")], "2026-05-20")).toEqual([]);
  });
  it("skips customers with an open lead", () => {
    expect(reorderCandidates(regular, "2026-09-18", new Set(["9811111111"]))).toEqual([]);
  });
});

describe("fillReorder", () => {
  it("fills the first name and garment", () => {
    expect(fillReorder(reorderMessage(), { name: "Meera Shah", lastGarment: "Blouse" })).toContain("Hi Meera! It's been a little while since your blouse");
    expect(fillReorder("{garment}", { name: "A", lastGarment: "" })).toBe("last outfit");
  });
});
