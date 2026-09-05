"use client";

import { useMemo, useState } from "react";
import { istDateString } from "@/lib/ist-date";

/** Shared date-range filter for every report page — quick presets plus a custom range, always
 *  computed against the shop's local (IST) "today" so a report run right after midnight doesn't
 *  silently use the previous day's boundary (same reasoning as istDateString itself). */
export type DateRangePreset = "all" | "this-month" | "last-month" | "this-quarter" | "this-year" | "custom";

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  all: "All time",
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "this-year": "This year",
  custom: "Custom",
};

export interface DateRange {
  /** Inclusive ISO date (yyyy-mm-dd), or "" for no lower bound. */
  from: string;
  /** Inclusive ISO date (yyyy-mm-dd), or "" for no upper bound. */
  to: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Turns a preset (plus a custom from/to when the preset is "custom") into a concrete
 *  inclusive [from, to] ISO range. "all" returns {"", ""} — an open range every caller's
 *  filter treats as "don't filter". */
export function resolveDateRange(preset: DateRangePreset, customFrom: string, customTo: string): DateRange {
  if (preset === "custom") return { from: customFrom, to: customTo };
  if (preset === "all") return { from: "", to: "" };

  const today = istDateString();
  const [y, m] = today.split("-").map(Number);

  switch (preset) {
    case "this-month":
      return { from: ymd(y, m, 1), to: ymd(y, m, daysInMonth(y, m)) };
    case "last-month": {
      const lm = m === 1 ? 12 : m - 1;
      const ly = m === 1 ? y - 1 : y;
      return { from: ymd(ly, lm, 1), to: ymd(ly, lm, daysInMonth(ly, lm)) };
    }
    case "this-quarter": {
      const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
      const qEndMonth = qStartMonth + 2;
      return { from: ymd(y, qStartMonth, 1), to: ymd(y, qEndMonth, daysInMonth(y, qEndMonth)) };
    }
    case "this-year":
      return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) };
  }
}

/** True when an ISO date string (or the date portion of a timestamp) falls inside the range —
 *  an empty `from`/`to` means that side is unbounded. Every report's filter reduces to this. */
export function isWithinDateRange(dateISO: string | null | undefined, range: DateRange): boolean {
  if (!dateISO) return false;
  const d = dateISO.slice(0, 10);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

/** One hook every activity/transaction report page uses for its date filter — mandatory across
 *  reports, so it lives in one place rather than each page reinventing preset/custom-range
 *  state. Defaults to "all time" so wiring this in doesn't silently change what a report shows
 *  the moment it's opened; callers that want a narrower default (e.g. "this month") pass it. */
export function useReportDateRange(defaultPreset: DateRangePreset = "all") {
  const [preset, setPreset] = useState<DateRangePreset>(defaultPreset);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(() => resolveDateRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range };
}
