import { describe, expect, it } from "vitest";
import { totalPieces } from "./sales";

describe("totalPieces", () => {
  it("sums every line's quantity", () => {
    expect(totalPieces([{ qty: 2 }, { qty: 1 }, { qty: 1 }, { qty: 1 }, { qty: 1 }])).toBe(6);
  });
  it("reads the editor's string quantities and ignores blanks and negatives", () => {
    expect(totalPieces([{ qty: "3" }, { qty: "" }, { qty: -2 }, { qty: "abc" }])).toBe(3);
  });
  it("is 0 for no lines", () => expect(totalPieces([])).toBe(0));
});
