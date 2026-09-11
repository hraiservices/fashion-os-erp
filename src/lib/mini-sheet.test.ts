import { describe, it, expect } from "vitest";
import { evalSheet, normalizeCell, normalizeCells, autoRangeAbove } from "@/lib/mini-sheet";

describe("evalSheet", () => {
  it("passes literal text/numbers through unchanged", () => {
    const out = evalSheet({ A1: "Fabric cost", B1: "120" });
    expect(out.A1).toBe("Fabric cost");
    expect(out.B1).toBe("120");
  });

  it("evaluates basic arithmetic with cell refs", () => {
    const out = evalSheet({ A1: "10", B1: "5", C1: "=A1+B1*2" });
    expect(out.C1).toBe("20");
  });

  it("evaluates SUM over a range", () => {
    const out = evalSheet({ A1: "1", A2: "2", A3: "3", B1: "=SUM(A1:A3)" });
    expect(out.B1).toBe("6");
  });

  it("evaluates AVERAGE/MIN/MAX", () => {
    const out = evalSheet({ A1: "2", A2: "4", A3: "6", B1: "=AVERAGE(A1:A3)", B2: "=MIN(A1:A3)", B3: "=MAX(A1:A3)" });
    expect(out.B1).toBe("4");
    expect(out.B2).toBe("2");
    expect(out.B3).toBe("6");
  });

  it("chains formulas that reference other formula cells", () => {
    const out = evalSheet({ A1: "5", B1: "=A1*2", C1: "=B1+1" });
    expect(out.B1).toBe("10");
    expect(out.C1).toBe("11");
  });

  it("reports a circular reference instead of hanging", () => {
    const out = evalSheet({ A1: "=B1", B1: "=A1" });
    expect(out.A1).toMatch(/^#/);
    expect(out.B1).toMatch(/^#/);
  });

  it("reports a parse error for garbage input", () => {
    const out = evalSheet({ A1: "=1 + + " });
    expect(out.A1).toMatch(/^#/);
  });

  it("reports divide-by-zero as an error", () => {
    const out = evalSheet({ A1: "10", B1: "0", C1: "=A1/B1" });
    expect(out.C1).toMatch(/^#/);
  });

  it("treats an empty cell reference as zero", () => {
    const out = evalSheet({ A1: "=A2+5" });
    expect(out.A1).toBe("5");
  });

  it("evaluates PRODUCT over a range", () => {
    const out = evalSheet({ A1: "2", A2: "3", A3: "4", B1: "=PRODUCT(A1:A3)" });
    expect(out.B1).toBe("24");
  });
});

describe("normalizeCell / normalizeCells", () => {
  it("upgrades a legacy plain-string cell to CellData", () => {
    expect(normalizeCell("=A1+1")).toEqual({ value: "=A1+1" });
  });

  it("passes through an already-structured cell, coercing bad fields away", () => {
    expect(normalizeCell({ value: "5", bold: true, color: "#ff0000", junk: 123 })).toEqual({
      value: "5",
      bold: true,
      italic: false,
      color: "#ff0000",
      bg: undefined,
    });
  });

  it("treats garbage as an empty cell", () => {
    expect(normalizeCell(42)).toEqual({ value: "" });
    expect(normalizeCell(null)).toEqual({ value: "" });
  });

  it("normalizes a whole mixed legacy/structured sheet", () => {
    const out = normalizeCells({ A1: "10", B1: { value: "20", italic: true } });
    expect(out.A1).toEqual({ value: "10" });
    expect(out.B1.italic).toBe(true);
  });
});

describe("autoRangeAbove", () => {
  it("returns null for row 1 (nothing above)", () => {
    expect(autoRangeAbove("A1", {})).toBeNull();
  });

  it("returns null when the cell directly above is blank", () => {
    expect(autoRangeAbove("A3", { A1: { value: "5" } })).toBeNull();
  });

  it("finds the contiguous run of filled cells directly above, stopping at the first blank", () => {
    const cells = { A1: { value: "1" }, A2: { value: "2" }, A3: { value: "3" }, A5: { value: "9" } };
    expect(autoRangeAbove("A4", cells)).toBe("A1:A3");
  });

  it("stops at the first blank going up, not the whole column", () => {
    const cells = { A1: { value: "1" }, A3: { value: "3" } };
    expect(autoRangeAbove("A4", cells)).toBe("A3:A3");
  });
});
