// Per-garment production checklist — stored as an extra `checklist` key inside each garment's
// Json object (Garment's index signature already permits arbitrary extra keys), not a new
// column/table. Lets a tailor track cut/stitched/finished/pressed per piece without the whole
// order having to advance stages for it.
import type { Garment } from "@/lib/types";
import type { Json } from "@/lib/supabase/database.types";

export const CHECKLIST_STEPS = ["cut", "stitched", "finished", "pressed"] as const;
export type ChecklistStep = (typeof CHECKLIST_STEPS)[number];

export const CHECKLIST_LABELS: Record<ChecklistStep, string> = {
  cut: "Cut",
  stitched: "Stitched",
  finished: "Finished",
  pressed: "Pressed",
};

export type GarmentChecklist = Record<ChecklistStep, boolean>;

function blankChecklist(): GarmentChecklist {
  return { cut: false, stitched: false, finished: false, pressed: false };
}

/** Reads a garment's checklist, defaulting every step to false if never set (older garments). */
export function getChecklist(g: Garment): GarmentChecklist {
  const raw = g.checklist as Partial<GarmentChecklist> | undefined;
  const out = blankChecklist();
  if (raw && typeof raw === "object") {
    CHECKLIST_STEPS.forEach((step) => {
      if (raw[step] === true) out[step] = true;
    });
  }
  return out;
}

/** Returns a new garment with one checklist step toggled — callers still own writing the
 *  updated garments array back via the order PATCH (garments-only partial patch). */
export function withChecklistStep(g: Garment, step: ChecklistStep, value: boolean): Garment {
  const checklist = { ...getChecklist(g), [step]: value };
  return { ...g, checklist: checklist as unknown as Json };
}

export function checklistProgress(g: Garment): { done: number; total: number } {
  const checklist = getChecklist(g);
  return { done: CHECKLIST_STEPS.filter((s) => checklist[s]).length, total: CHECKLIST_STEPS.length };
}

/** Aggregate progress across every garment on an order — powers the kanban card's "x/y" chip. */
export function orderChecklistProgress(garments: Garment[]): { done: number; total: number } {
  return garments.reduce(
    (acc, g) => {
      const p = checklistProgress(g);
      return { done: acc.done + p.done, total: acc.total + p.total };
    },
    { done: 0, total: 0 }
  );
}
