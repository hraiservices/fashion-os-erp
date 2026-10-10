import { describe, it, expect } from "vitest";
import { dateStr, isRealDate, isUuid } from "./targets-api";

describe("isRealDate", () => {
  it("accepts real calendar dates, including a leap day", () => {
    expect(isRealDate("2026-09-30")).toBe(true);
    expect(isRealDate("2028-02-29")).toBe(true);
  });
  it("rejects dates that have the right shape but don't exist", () => {
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("2027-02-29")).toBe(false);
    expect(isRealDate("2026-13-01")).toBe(false);
    expect(isRealDate("2026-00-10")).toBe(false);
    expect(isRealDate("2026-09-31")).toBe(false);
  });
  it("rejects anything that isn't YYYY-MM-DD", () => {
    expect(isRealDate("30/09/2026")).toBe(false);
    expect(isRealDate("2026-9-3")).toBe(false);
    expect(isRealDate("")).toBe(false);
  });
});

describe("dateStr and isUuid", () => {
  it("dateStr gives the user a readable message for an impossible date", () => {
    const r = dateStr.safeParse("2026-02-30");
    expect(r.success).toBe(false);
    expect(dateStr.safeParse("2026-09-30").success).toBe(true);
    expect(dateStr.nullable().safeParse(null).success).toBe(true);
  });
  it("isUuid only accepts a UUID", () => {
    expect(isUuid("3f2b8c1e-6d1a-4b7e-9c51-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});
