"use client";

import { Check } from "lucide-react";
import { CHECKLIST_STEPS, CHECKLIST_LABELS, getChecklist, withChecklistStep } from "@/lib/garment-checklist";
import { cn } from "@/lib/utils";
import type { Garment } from "@/lib/types";

/**
 * Per-garment production checklist (Cut/Stitched/Finished/Pressed) — visible/editable by
 * anyone with changeStage (tailors), not gated to editOrder. Toggling calls onChange with the
 * FULL updated garments array; the caller PATCHes { garments } via the existing order-edit
 * route (src/app/api/orders/[id]/route.ts already supports a garments-only partial patch).
 */
export function GarmentChecklistRow({
  garment,
  index,
  garments,
  onChange,
  disabled,
}: {
  garment: Garment;
  index: number;
  garments: Garment[];
  onChange: (next: Garment[]) => void;
  disabled?: boolean;
}) {
  const checklist = getChecklist(garment);

  function toggle(step: (typeof CHECKLIST_STEPS)[number]) {
    if (disabled) return;
    const next = garments.map((g, i) => (i === index ? withChecklistStep(g, step, !checklist[step]) : g));
    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {CHECKLIST_STEPS.map((step) => {
        const done = checklist[step];
        return (
          <button
            key={step}
            type="button"
            disabled={disabled}
            onClick={() => toggle(step)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              done
                ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {done && <Check className="size-3" />}
            {CHECKLIST_LABELS[step]}
          </button>
        );
      })}
    </div>
  );
}
