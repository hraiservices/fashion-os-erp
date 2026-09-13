// Shared "bucket the last N days/months, oldest first" helpers — used by any dashboard
// card or report that needs a Week/Month/6 Months time axis (Profit Overview, Pipeline
// Velocity, Tailor Performance, ...). A bucket's `key` is a date-string prefix
// ("yyyy-mm" or "yyyy-mm-dd"); matching a record to a bucket is always just
// `record.someDateField?.startsWith(bucket.key)`, which works whether the field is a
// bare date or a full timestamp.
import { istDateString } from "@/lib/ist-date";

export interface PeriodBucket {
  key: string;
  label: string;
}

export function fmtMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export function fmtDayLabel(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Last 6 calendar months, oldest first, as "yyyy-mm" keys. istDateString, NOT toISOString:
 *  setDate(1) keeps the current time-of-day, so between 00:00 and 05:30 IST toISOString()
 *  rolls back to the last day of the PREVIOUS month and every bucket key silently shifts a
 *  month (the current month vanishes). */
export function getLast6MonthKeys(): string[] {
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(istDateString(d).substring(0, 7));
  }
  return months;
}

/** Last `days` calendar days, oldest first, ending today, as "yyyy-mm-dd" keys. */
export function getLastNDayKeys(days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(istDateString(d));
  }
  return out;
}

export function last6MonthBuckets(): PeriodBucket[] {
  return getLast6MonthKeys().map((key) => ({ key, label: fmtMonthLabel(key) }));
}

export function lastNDayBuckets(days: number): PeriodBucket[] {
  return getLastNDayKeys(days).map((key) => ({ key, label: fmtDayLabel(key) }));
}

/** The three time ranges every "live chart" dashboard card offers. "week" and "month" are
 *  day-level buckets (7 days, and day-of-month-so-far respectively); "6m" is month-level. */
export type ChartRange = "week" | "month" | "6m";

export function bucketsForRange(range: ChartRange): PeriodBucket[] {
  if (range === "6m") return last6MonthBuckets();
  return lastNDayBuckets(range === "week" ? 7 : new Date().getDate());
}

/** The earliest date-string covered by a range — for a card that aggregates one total per
 *  range rather than a per-bucket series (e.g. Tailor Performance's leaderboard). */
export function rangeStartKey(range: ChartRange): string {
  const buckets = bucketsForRange(range);
  return buckets[0]?.key ?? istDateString(new Date());
}
