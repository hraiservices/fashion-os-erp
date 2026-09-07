"use client";

import { Check } from "lucide-react";
import {
  CHECKLIST_STEPS,
  CHECKLIST_LABELS,
  getChecklist,
  withChecklistStep,
  pieceCount,
  hasMultiplePieces,
  getPieceChecklist,
  getPieceLabel,
  withPieceChecklistStep,
  withPieceLabel,
} from "@/lib/garment-checklist";
import { cn } from "@/lib/utils";
import type { Garment } from "@/lib/types";

function ChecklistChips({
  checklist,
  disabled,
  onToggle,
}: {
  checklist: ReturnType<typeof getChecklist>;
  disabled?: boolean;
  onToggle: (step: (typeof CHECKLIST_STEPS)[number]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHECKLIST_STEPS.map((step) => {
        const done = checklist[step];
        return (
          <button
            key={step}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(step)}
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

/**
 * Per-garment production checklist (Cutting/Stitching/Finishing/Ready), visible/editable by
 * anyone with changeStage (tailors), not gated to editOrder. Toggling calls onChange with the
 * FULL updated garments array; the caller PATCHes { garments } via the existing order-edit
 * route (src/app/api/orders/[id]/route.ts already supports a garments-only partial patch).
 *
 * A garment line ordered in quantity > 1 (e.g. "Suit x3") renders one row per unit instead of
 * one shared checklist — the tailor may only have started cutting one of the three suits, and a
 * single shared checklist can't represent that. Each piece gets its own chips and an optional
 * one-line note (e.g. "grey fabric, customer's own cloth") so otherwise-identical pieces can be
 * told apart. A qty-1 line renders exactly as before — a single row, no piece label.
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
  if (!hasMultiplePieces(garment)) {
    const checklist = getChecklist(garment);
    return (
      <ChecklistChips
        checklist={checklist}
        disabled={disabled}
        onToggle={(step) => {
          if (disabled) return;
          const next = garments.map((g, i) => (i === index ? withChecklistStep(g, step, !checklist[step]) : g));
          onChange(next);
        }}
      />
    );
  }

  const n = pieceCount(garment);
  return (
    <div className="space-y-2">
      {Array.from({ length: n }, (_, pieceIndex) => {
        const checklist = getPieceChecklist(garment, pieceIndex);
        const label = getPieceLabel(garment, pieceIndex);
        return (
          <div key={pieceIndex} className="space-y-1 rounded-md border border-dashed border-border/70 p-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Piece {pieceIndex + 1}</span>
              <input
                type="text"
                value={label}
                disabled={disabled}
                placeholder="Add note (optional)"
                onChange={(e) => {
                  const next = garments.map((g, i) => (i === index ? withPieceLabel(g, pieceIndex, e.target.value) : g));
                  onChange(next);
                }}
                className="h-6 min-w-0 flex-1 rounded border-0 bg-transparent px-1 text-[11px] text-muted-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-muted"
              />
            </div>
            <ChecklistChips
              checklist={checklist}
              disabled={disabled}
              onToggle={(step) => {
                if (disabled) return;
                const next = garments.map((g, i) => (i === index ? withPieceChecklistStep(g, pieceIndex, step, !checklist[step]) : g));
                onChange(next);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
