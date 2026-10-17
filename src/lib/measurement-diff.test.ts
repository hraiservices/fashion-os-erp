import { describe, expect, it } from "vitest";
import { measurementChanges } from "./measurement-diff";

describe("measurementChanges", () => {
  it("flags big moves and ignores small, blank and non-numeric ones", () => {
    const r = measurementChanges({ waist: "32", hip: "38", length: "40", sleeve: "" }, { waist: "35", hip: "38.5", length: "abc", sleeve: "18" });
    expect(r).toEqual([{ key: "waist", label: "Waist", before: 32, after: 35, diff: 3 }]);
  });
  it("sorts by size of change", () => {
    const r = measurementChanges({ a: "10", b: "10" }, { a: "13", b: "16" });
    expect(r.map((c) => c.key)).toEqual(["b", "a"]);
  });
});
