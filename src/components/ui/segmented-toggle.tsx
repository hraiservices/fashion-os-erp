"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Small pill-shaped 2-3 option toggle group (view mode, order type, etc). Several places in the
 * app hand-rolled this exact pattern independently (raw buttons + the same cn() classes) —
 * this is the one shared version, so it only needs fixing/theming in one place.
 */
export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  ariaLabel: string;
}) {
  return (
    <div className="flex w-full rounded-lg border p-0.5" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={cn(
              "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors sm:min-h-8",
              value === o.value ? "bg-muted" : "text-muted-foreground"
            )}
          >
            {Icon && <Icon className="size-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
