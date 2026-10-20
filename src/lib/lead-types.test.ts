import { describe, expect, it } from "vitest";
import { cleanLeadTypes, DEFAULT_LEAD_TYPES, MAX_LEAD_TYPES, matchesLeadTypeFilter, UNSET_LEAD_TYPE } from "@/lib/lead-types";

describe("cleanLeadTypes", () => {
  it("falls back to the defaults for non-array or empty input", () => {
    expect(cleanLeadTypes(null)).toEqual(DEFAULT_LEAD_TYPES);
    expect(cleanLeadTypes(undefined)).toEqual(DEFAULT_LEAD_TYPES);
    expect(cleanLeadTypes("App Sale")).toEqual(DEFAULT_LEAD_TYPES);
    expect(cleanLeadTypes([])).toEqual(DEFAULT_LEAD_TYPES);
    expect(cleanLeadTypes(["", "   "])).toEqual(DEFAULT_LEAD_TYPES);
  });

  it("trims, keeps order, and drops non-string entries", () => {
    expect(cleanLeadTypes([" App Sale ", 5, null, "Wholesale"])).toEqual(["App Sale", "Wholesale"]);
  });

  it("de-duplicates case-insensitively, keeping the first spelling", () => {
    expect(cleanLeadTypes(["Referral", "referral", "REFERRAL "])).toEqual(["Referral"]);
  });

  it("caps length and count", () => {
    expect(cleanLeadTypes(["x".repeat(60)])[0]).toHaveLength(40);
    const many = Array.from({ length: 30 }, (_, i) => `Type ${i}`);
    expect(cleanLeadTypes(many)).toHaveLength(MAX_LEAD_TYPES);
  });
});

describe("matchesLeadTypeFilter", () => {
  it("matches everything when the filter is empty", () => {
    expect(matchesLeadTypeFilter("App Sale", "")).toBe(true);
    expect(matchesLeadTypeFilter(null, "")).toBe(true);
  });

  it("matches only untyped leads for the unset sentinel", () => {
    expect(matchesLeadTypeFilter(null, UNSET_LEAD_TYPE)).toBe(true);
    expect(matchesLeadTypeFilter(undefined, UNSET_LEAD_TYPE)).toBe(true);
    expect(matchesLeadTypeFilter("App Sale", UNSET_LEAD_TYPE)).toBe(false);
  });

  it("matches an exact type", () => {
    expect(matchesLeadTypeFilter("App Sale", "App Sale")).toBe(true);
    expect(matchesLeadTypeFilter("Referral", "App Sale")).toBe(false);
    expect(matchesLeadTypeFilter(null, "App Sale")).toBe(false);
  });
});
