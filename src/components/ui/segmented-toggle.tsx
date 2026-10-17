"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { TONES, type Tone } from "@/lib/ui-tones";

/**
 * Small pill-shaped 2-3 option toggle group (view mode, order type, etc). Several places in the
 * app hand-rolled this exact pattern independently (raw buttons + the same cn() classes) —
 * this is the one shared version, so it only needs fixing/theming in one place.
 *
 * Give an option a `tone` to make it a colourful section tab (each option its own colour, solid when selected),
 * and a `count` to show a small number badge beside its label.
 */
export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: LucideIcon; tone?: Tone; count?: number }[];
  ariaLabel: string;
}) {
  // 4+ options with icons (the Targets sections) don't fit a phone's width otherwise — the last
  // button used to poke out past the border. Buttons may shrink (min-w-0) and, on narrow phones,
  // such a toggle drops its icons so the labels keep their room.
  const dense = options.length > 3;
  const colourful = options.some((o) => o.tone);
  return (
    <div className={cn("flex w-full border", colourful ? "gap-1 rounded-xl p-1" : "rounded-lg p-0.5")} role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const Icon = o.icon;
        const tone = o.tone ? TONES[o.tone] : null;
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={cn(
              "relative flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1.5 text-xs font-medium transition-colors sm:px-2",
              tone ? "min-h-11 rounded-lg sm:min-h-10 sm:text-sm" : "min-h-9 rounded-md sm:min-h-8",
              tone ? (selected ? tone.active : tone.idle) : selected ? "bg-muted" : "text-muted-foreground"
            )}
          >
            {Icon && <Icon className={cn("size-4 shrink-0", dense && "max-[430px]:hidden")} />}
            <span className="truncate">{o.label}</span>
            {o.count !== undefined && (
              // On a phone the pill sits on the tab's top corner instead of beside the label, so a 4-tab row keeps its full labels.
              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums max-sm:absolute max-sm:-right-0.5 max-sm:-top-1.5 max-sm:border max-sm:border-background max-sm:px-1", tone ? (selected ? tone.badgeOn : tone.badge) : "bg-muted text-muted-foreground", tone && selected && "max-sm:bg-foreground max-sm:text-background")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
