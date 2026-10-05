"use client";

import { useState, type ReactNode } from "react";
import { X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/report-date-range";
import { cn } from "@/lib/utils";

const PRESET_ORDER: DateRangePreset[] = ["all", "today", "this-month", "last-month", "this-quarter", "this-year", "custom"];

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
  // Mobile only — on a phone, the 7-button preset grid below used to render in full every time,
  // ahead of any actual report data. Collapsed to a single "<current preset> ▾" pill by default
  // so data is visible right away; tapping it reveals the grid, and picking a (non-custom) preset
  // re-collapses it. Desktop keeps the original always-visible row regardless of this state (every
  // conditional className below carries its own `sm:` override). Starts open when the page loaded
  // with "custom" already selected, since the date pickers it reveals are still needed input, not
  // just a readout.
  const [expanded, setExpanded] = useState(preset === "custom");

  return (
    <div
      className={cn(
        // Stacked, full-width rows below `sm` — the previous single flex-wrap row let the
        // custom date pickers (fixed w-36 each) overflow the viewport on a phone instead of
        // wrapping cleanly, and left the category/Clear/result-count trio scattered across
        // disconnected lines with no visual grouping. Each control group below is its own full-
        // width row on mobile; `sm:` restores the original single-row flex-wrap layout.
        "flex flex-col gap-3 rounded-xl border bg-card p-3 print:hidden sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-3 sm:gap-y-2",
        className
      )}
    >
      <div className="w-full sm:w-auto">
        <Label className="mb-1.5 block text-sm font-bold text-muted-foreground">Date range</Label>

        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm font-medium sm:hidden",
            expanded && "hidden"
          )}
        >
          {DATE_RANGE_PRESET_LABELS[preset]}
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>

        {/* Below `sm`: a 3-column grid instead of intrinsic-width flex-wrap — the preset labels
         *  vary a lot in length ("Today" vs "This quarter"), so flex-wrap left ragged gaps and,
         *  worst of all, a lone last button ("Custom") stranded on its own row with a big empty
         *  gap next to it instead of filling the card. Grid gives every button an equal-width
         *  cell; Custom (always last, per PRESET_ORDER) explicitly spans the full row so it never
         *  looks like it's floating in empty space. `sm:` restores the original intrinsic-width
         *  flex-wrap row for desktop, where there's room for it to look natural — and ignores
         *  `expanded` entirely, since the collapse/expand toggle above is mobile-only. */}
        <div className={cn("grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap", !expanded && "hidden sm:flex")}>
          {PRESET_ORDER.map((p) => (
            <Button
              key={p}
              type="button"
              variant={preset === p ? "default" : "outline"}
              size="sm"
              className={cn("w-full sm:w-auto", p === "custom" && "col-span-3 sm:col-span-1")}
              onClick={() => {
                onPresetChange(p);
                if (p !== "custom") setExpanded(false);
              }}
            >
              {DATE_RANGE_PRESET_LABELS[p]}
            </Button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <DatePicker className="w-full sm:w-36" value={customFrom} onChange={onCustomFromChange} placeholder="From" />
          <span className="shrink-0 text-xs text-muted-foreground">to</span>
          <DatePicker className="w-full sm:w-36" value={customTo} onChange={onCustomToChange} placeholder="To" />
        </div>
      )}

      {category && <div className="w-full sm:w-auto">{category}</div>}

      {(preset !== "all" || resultLabel) && (
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:contents">
          {preset !== "all" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onPresetChange("all")}>
              <X className="size-3.5" /> Clear
            </Button>
          ) : (
            <span />
          )}
          {resultLabel && <span className="text-xs tabular-nums text-muted-foreground sm:ml-auto">{resultLabel}</span>}
        </div>
      )}
    </div>
  );
}
