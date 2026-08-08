"use client";

import { cn } from "@/lib/utils";
import type { SaleTypeFilter } from "@/lib/unified-sales";

const OPTIONS: { value: SaleTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stitching", label: "Stitching Orders" },
  { value: "retail", label: "Product Sales" },
];

/** Shared All/Stitching Orders/Product Sales segmented control — every report combining the two sources should use this, not its own filter UI. */
export function SalesTypeFilter({ value, onChange }: { value: SaleTypeFilter; onChange: (v: SaleTypeFilter) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Filter by sale type">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === o.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
