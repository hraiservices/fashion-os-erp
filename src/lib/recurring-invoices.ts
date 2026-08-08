import type { RecurringFrequency, RecurringEndType, RecurringInvoiceProfile } from "@/lib/types";

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

/** Advances a YYYY-MM-DD date string by one cycle of the given frequency. */
export function advanceRecurringDate(dateStr: string, frequency: RecurringFrequency): string {
  const d = new Date(dateStr + "T00:00:00");
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
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
export function recurringProfileIsDue(profile: Pick<RecurringInvoiceProfile, "active" | "nextRunDate" | "endType" | "endDate" | "endAfterCount" | "occurrencesGenerated">, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!profile.active) return false;
  if (recurringProfileHasEnded(profile)) return false;
  return profile.nextRunDate <= today;
}
