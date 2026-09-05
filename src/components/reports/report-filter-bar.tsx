"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/report-date-range";
import { cn } from "@/lib/utils";

const PRESET_ORDER: DateRangePreset[] = ["all", "this-month", "last-month", "this-quarter", "this-year", "custom"];

/**
 * Shared filter bar every report page renders at its top — the date-range half of "add filters
 * (date range/month/category) to all reports". `category` is an optional slot for whatever
 * dimension a specific report actually has (garment type, expense category, payment method,
 * tailor, …); there's no one generic "category" every report shares, so each page supplies its
 * own Select and this bar just gives it a consistent place to sit next to the date range.
 * `print:hidden` — this is an input control, not something a printed report page should show.
 */
export function ReportFilterBar({
  preset,
  onPresetChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
  category,
  resultLabel,
  className,
}: {
  preset: DateRangePreset;
  onPresetChange: (p: DateRangePreset) => void;
  customFrom: string;
  onCustomFromChange: (v: string) => void;
  customTo: string;
  onCustomToChange: (v: string) => void;
  /** A report-specific filter control (a Select, usually) — omit if the report has no other
   *  meaningful filter dimension. */
  category?: ReactNode;
  /** e.g. "42 orders" — shown right-aligned, same pattern as OrderFilters' result count. */
  resultLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border bg-card p-3 print:hidden", className)}>
      <div>
        <Label className="mb-1.5 block text-xs text-muted-foreground">Date range</Label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_ORDER.map((p) => (
            <Button key={p} type="button" variant={preset === p ? "default" : "outline"} size="sm" onClick={() => onPresetChange(p)}>
              {DATE_RANGE_PRESET_LABELS[p]}
            </Button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <DatePicker className="w-36" value={customFrom} onChange={onCustomFromChange} placeholder="From" />
          <span className="text-xs text-muted-foreground">to</span>
          <DatePicker className="w-36" value={customTo} onChange={onCustomToChange} placeholder="To" />
        </div>
      )}

      {category}

      {preset !== "all" && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onPresetChange("all")}>
          <X className="size-3.5" /> Clear
        </Button>
      )}

      {resultLabel && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{resultLabel}</span>}
    </div>
  );
}
