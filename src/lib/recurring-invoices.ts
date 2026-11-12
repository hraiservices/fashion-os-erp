import type { RecurringFrequency, RecurringEndType, RecurringInvoiceProfile } from "@/lib/types";
import { istDateString } from "@/lib/ist-date";

export const RECURRING_FREQUENCIES: RecurringFrequency[] = ["weekly", "monthly", "quarterly", "yearly"];

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export const RECURRING_END_TYPES: RecurringEndType[] = ["never", "on_date", "after_count"];

export const RECURRING_END_TYPE_LABELS: Record<RecurringEndType, string> = {
  never: "Never",
  on_date: "On date",
  after_count: "After N invoices",
};

/** Formats a Date as YYYY-MM-DD from its LOCAL parts.
 *
 *  Not `toISOString().slice(0, 10)`, which is the bug this replaces: `new Date(dateStr +
 *  "T00:00:00")` parses in local time, so on any host east of UTC (TZ=Asia/Kolkata, which this
 *  codebase assumes everywhere else) local midnight is 18:30 UTC the day BEFORE, and every
 *  advance returned the previous day. Cumulatively: a subscription billed on the 15th walked
 *  to the 14th, then the 13th. It survived only because Vercel runs on UTC. */
function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Adds `months` calendar months to a YYYY-MM-DD date, clamping to the last day of the target
 *  month when the naive add would overflow (e.g. Jan 31 + 1 month is Feb 28/29, not Mar 3 —
 *  `Date.setMonth` overflows into the following month instead). Handles the yearly case too
 *  (12 months, so Feb 29 on a leap year correctly clamps to Feb 28 the next year). */
function addMonthsClamped(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInTargetMonth));
  return localDateString(d);
}

/** Advances a YYYY-MM-DD date string by one cycle of the given frequency. */
export function advanceRecurringDate(dateStr: string, frequency: RecurringFrequency): string {
  switch (frequency) {
    case "weekly": {
      const d = new Date(dateStr + "T00:00:00");
      d.setDate(d.getDate() + 7);
      return localDateString(d);
    }
    case "monthly":
      return addMonthsClamped(dateStr, 1);
    case "quarterly":
      return addMonthsClamped(dateStr, 3);
    case "yearly":
      return addMonthsClamped(dateStr, 12);
  }
}

/** Whether the profile is still eligible to generate further invoices, given its end condition. */
export function recurringProfileHasEnded(profile: Pick<RecurringInvoiceProfile, "endType" | "endDate" | "endAfterCount" | "occurrencesGenerated" | "nextRunDate">): boolean {
  if (profile.endType === "on_date" && profile.endDate) {
    return profile.nextRunDate > profile.endDate;
  }
  if (profile.endType === "after_count" && profile.endAfterCount != null) {
    return profile.occurrencesGenerated >= profile.endAfterCount;
  }
  return false;
}

/** Whether this profile is due to generate an invoice today (or is overdue). */
export function recurringProfileIsDue(profile: Pick<RecurringInvoiceProfile, "active" | "nextRunDate" | "endType" | "endDate" | "endAfterCount" | "occurrencesGenerated">, today = istDateString()): boolean {
  if (!profile.active) return false;
  if (recurringProfileHasEnded(profile)) return false;
  return profile.nextRunDate <= today;
}
