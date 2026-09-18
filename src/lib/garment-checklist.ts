// Per-garment production checklist — stored as an extra `checklist` key inside each garment's
// Json object (Garment's index signature already permits arbitrary extra keys), not a new
// column/table. Lets a tailor track cutting/stitching/finishing/ready per piece without the
// whole order having to advance stages for it.
//
// A garment line's quantity (`no`) can be more than 1 (e.g. "Suit x3") while the pieces inside
// it move through production independently — one suit can be cut before the other two are even
// started. For a qty-1 line, the checklist lives directly on the garment (`garment.checklist`,
// unchanged from before this file supported multiple pieces — no migration needed for the vast
// majority of existing garments). For a qty>1 line, each unit gets its own entry in
// `garment.pieces`, created lazily the first time any piece is ticked — until then a multi-qty
// line simply has no per-piece progress yet, same as a freshly created garment has no checklist.
import type { Garment } from "@/lib/types";
import type { Json } from "@/lib/supabase/database.types";

export const CHECKLIST_STEPS = ["cut", "stitched", "finished", "pressed"] as const;
export type ChecklistStep = (typeof CHECKLIST_STEPS)[number];

// Labels only — the stored keys above (cut/stitched/finished/pressed) stay as-is so no existing
// garment's saved checklist needs migrating. Renamed to match the board's own stage names
// (Received > Cutting > Stitching > Ready > Delivered) so staff read one vocabulary, not two.
export const CHECKLIST_LABELS: Record<ChecklistStep, string> = {
  cut: "Cutting",
  stitched: "Stitching",
  finished: "Finishing",
  pressed: "Ready",
};

export type GarmentChecklist = Record<ChecklistStep, boolean>;

export interface GarmentPiece {
  checklist?: GarmentChecklist;
  /** Optional free-text tag so staff can tell otherwise-identical pieces apart at a glance,
   *  e.g. "grey fabric, customer's own cloth". Blank unless someone fills it in. */
  label?: string;
}

function blankChecklist(): GarmentChecklist {
  return { cut: false, stitched: false, finished: false, pressed: false };
}

function readChecklist(raw: unknown): GarmentChecklist {
  const out = blankChecklist();
  if (raw && typeof raw === "object") {
    CHECKLIST_STEPS.forEach((step) => {
      if ((raw as Partial<GarmentChecklist>)[step] === true) out[step] = true;
    });
  }
  return out;
}

/** Reads a garment's (qty-1) checklist, defaulting every step to false if never set. */
export function getChecklist(g: Garment): GarmentChecklist {
  return readChecklist(g.checklist);
}

/** Returns a new garment with one checklist step toggled — callers still own writing the
 *  updated garments array back via the order PATCH (garments-only partial patch). */
export function withChecklistStep(g: Garment, step: ChecklistStep, value: boolean): Garment {
  const checklist = { ...getChecklist(g), [step]: value };
  return { ...g, checklist: checklist as unknown as Json };
}

/** How many individually-trackable pieces this garment line has — 1 for a normal line, or its
 *  quantity when that's more than 1. Never 0 (a line with no/blank quantity is still one piece). */
export function pieceCount(g: Garment): number {
  return Math.max(1, g.no || 1);
}

/** True once this line actually needs per-piece rows drawn (qty > 1) — a qty-1 line keeps using
 *  the plain single-checklist UI it always has. */
export function hasMultiplePieces(g: Garment): boolean {
  return pieceCount(g) > 1;
}

function rawPieces(g: Garment): Partial<GarmentPiece>[] {
  return Array.isArray(g.pieces) ? (g.pieces as unknown as Partial<GarmentPiece>[]) : [];
}

/** The checklist for one piece of a multi-quantity line (or the line's own checklist when it's
 *  effectively a single piece — qty <= 1 always resolves to piece 0 via getChecklist). */
export function getPieceChecklist(g: Garment, index: number): GarmentChecklist {
  if (!hasMultiplePieces(g)) return getChecklist(g);
  return readChecklist(rawPieces(g)[index]?.checklist);
}

export function getPieceLabel(g: Garment, index: number): string {
  if (!hasMultiplePieces(g)) return "";
  const label = rawPieces(g)[index]?.label;
  return typeof label === "string" ? label : "";
}

/** Pads/copies the existing pieces array out to pieceCount(g) entries before writing one back. */
function paddedPieces(g: Garment): Partial<GarmentPiece>[] {
  const existing = rawPieces(g);
  const n = pieceCount(g);
  const out: Partial<GarmentPiece>[] = [];
  for (let i = 0; i < n; i++) out.push(existing[i] ?? {});
  return out;
}

export function withPieceChecklistStep(g: Garment, index: number, step: ChecklistStep, value: boolean): Garment {
  if (!hasMultiplePieces(g)) return withChecklistStep(g, step, value);
  const pieces = paddedPieces(g);
  const checklist = { ...readChecklist(pieces[index]?.checklist), [step]: value };
  pieces[index] = { ...pieces[index], checklist };
  return { ...g, pieces: pieces as unknown as Json };
}

export function withPieceLabel(g: Garment, index: number, label: string): Garment {
  if (!hasMultiplePieces(g)) return g;
  const pieces = paddedPieces(g);
  pieces[index] = { ...pieces[index], label };
  return { ...g, pieces: pieces as unknown as Json };
}

/** Progress across every piece of one garment line (1 piece for a normal qty-1 line). */
export function checklistProgress(g: Garment): { done: number; total: number } {
  const n = pieceCount(g);
  let done = 0;
  for (let i = 0; i < n; i++) {
    const c = getPieceChecklist(g, i);
    done += CHECKLIST_STEPS.filter((s) => c[s]).length;
  }
  return { done, total: n * CHECKLIST_STEPS.length };
}

/** True once every piece of this garment line has reached the final ("pressed"/Ready) step —
 *  for a qty-1 line that's just its own checklist; for qty>1 it requires every piece done, not
 *  just one, since a line isn't finished until the last piece is. */
export function isFullyDone(g: Garment): boolean {
  const n = pieceCount(g);
  for (let i = 0; i < n; i++) {
    if (!getPieceChecklist(g, i).pressed) return false;
  }
  return true;
}

/** Aggregate progress across every garment (and every piece within each) on an order — powers
 *  the kanban card's "x/y" chip and progress bar. */
export function orderChecklistProgress(garments: Garment[]): { done: number; total: number } {
  return garments.reduce(
    (acc, g) => {
      const p = checklistProgress(g);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 }
  );
}
