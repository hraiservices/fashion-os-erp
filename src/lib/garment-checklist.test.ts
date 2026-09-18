import { describe, it, expect } from "vitest";
import {
  getChecklist,
  withChecklistStep,
  pieceCount,
  hasMultiplePieces,
  getPieceChecklist,
  getPieceLabel,
  withPieceChecklistStep,
  withPieceLabel,
  isFullyDone,
  checklistProgress,
  orderChecklistProgress,
} from "@/lib/garment-checklist";
import type { Garment } from "@/lib/types";

function garment(overrides: Partial<Garment> = {}): Garment {
  return { type: "Suit", ...overrides };
}

describe("qty-1 garments (no piece splitting)", () => {
  it("has exactly one piece and no multi-piece UI", () => {
    const g = garment();
    expect(pieceCount(g)).toBe(1);
    expect(hasMultiplePieces(g)).toBe(false);
  });

  it("keeps reading/writing the legacy top-level checklist field", () => {
    let g = garment();
    expect(getChecklist(g).cut).toBe(false);
    g = withChecklistStep(g, "cut", true);
    expect(getChecklist(g).cut).toBe(true);
    // Piece-aware accessors resolve to the same single checklist for a qty-1 line.
    expect(getPieceChecklist(g, 0).cut).toBe(true);
  });

  it("a garment created before pieces existed still works untouched", () => {
    const g = garment({ checklist: { cut: true, stitched: true, finished: false, pressed: false } });
    expect(getChecklist(g)).toEqual({ cut: true, stitched: true, finished: false, pressed: false });
    expect(isFullyDone(g)).toBe(false);
  });
});

describe("qty>1 garments (per-piece tracking)", () => {
  it("reports the right piece count", () => {
    expect(pieceCount(garment({ no: 3 }))).toBe(3);
    expect(hasMultiplePieces(garment({ no: 3 }))).toBe(true);
  });

  it("each piece starts blank and independent", () => {
    const g = garment({ no: 3 });
    expect(getPieceChecklist(g, 0).cut).toBe(false);
    expect(getPieceChecklist(g, 1).cut).toBe(false);
    expect(getPieceChecklist(g, 2).cut).toBe(false);
  });

  it("ticking one piece's step never affects the other pieces — the actual bug this whole feature exists to fix", () => {
    let g = garment({ no: 3 });
    g = withPieceChecklistStep(g, 1, "cut", true);
    expect(getPieceChecklist(g, 0).cut).toBe(false);
    expect(getPieceChecklist(g, 1).cut).toBe(true);
    expect(getPieceChecklist(g, 2).cut).toBe(false);
  });

  it("does not disturb the legacy top-level checklist field", () => {
    let g = garment({ no: 3 });
    g = withPieceChecklistStep(g, 0, "cut", true);
    expect(g.checklist).toBeUndefined();
  });

  it("supports an optional per-piece label", () => {
    let g = garment({ no: 2 });
    expect(getPieceLabel(g, 0)).toBe("");
    g = withPieceLabel(g, 0, "grey fabric, customer's own cloth");
    expect(getPieceLabel(g, 0)).toBe("grey fabric, customer's own cloth");
    expect(getPieceLabel(g, 1)).toBe("");
  });

  it("isFullyDone requires every piece to be pressed, not just one", () => {
    let g = garment({ no: 2 });
    g = withPieceChecklistStep(g, 0, "pressed", true);
    expect(isFullyDone(g)).toBe(false);
    g = withPieceChecklistStep(g, 1, "pressed", true);
    expect(isFullyDone(g)).toBe(true);
  });

  it("checklistProgress counts across every piece", () => {
    let g = garment({ no: 3 });
    g = withPieceChecklistStep(g, 0, "cut", true);
    g = withPieceChecklistStep(g, 1, "cut", true);
    g = withPieceChecklistStep(g, 1, "stitched", true);
    expect(checklistProgress(g)).toEqual({ done: 3, total: 12 });
  });
});

describe("orderChecklistProgress across mixed garments", () => {
  it("sums a qty-1 garment and a qty>1 garment together", () => {
    let a = garment({ type: "Shirt" });
    a = withChecklistStep(a, "cut", true);
    let b = garment({ type: "Suit", no: 3 });
    b = withPieceChecklistStep(b, 1, "cut", true);
    expect(orderChecklistProgress([a, b])).toEqual({ done: 2, total: 4 + 12 });
  });
});
