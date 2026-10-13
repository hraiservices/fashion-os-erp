"use client";

import { useMemo } from "react";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { isWithinDateRange, useReportDateRange, type DateRangePreset } from "@/lib/report-date-range";

/**
 * The Reports date filter for a plain list screen (invoices, payments, bills…): `rows` is `items` inside the chosen
 * range; render <ListDateBar dr={dr} …/> above the list. Open-item lists default to "all" so nothing owed is hidden;
 * ledger-style lists (payments, stock movements) default to this month.
 */
export function useListDateFilter<T>(items: T[] | undefined, dateOf: (item: T) => string | null | undefined, defaultPreset: DateRangePreset = "all") {
  const dr = useReportDateRange(defaultPreset);
  const rows = useMemo(
    () => (items || []).filter((i) => isWithinDateRange(dateOf(i), dr.range)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dateOf is a fixed accessor per page
    [items, dr.range]
  );
  return { dr, rows };
}

export function ListDateBar({ dr, shown, total, noun }: { dr: ReturnType<typeof useReportDateRange>; shown: number; total: number; noun: string }) {
  return (
    <ReportFilterBar
      preset={dr.preset}
      onPresetChange={dr.setPreset}
      customFrom={dr.customFrom}
      onCustomFromChange={dr.setCustomFrom}
      customTo={dr.customTo}
      onCustomToChange={dr.setCustomTo}
      resultLabel={`${shown} of ${total} ${noun}`}
    />
  );
}
