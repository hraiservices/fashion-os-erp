import { istDateString } from "@/lib/ist-date";

export type PlannerKind = "note" | "todo";
export const PLANNER_KINDS: PlannerKind[] = ["note", "todo"];
export const PLANNER_KIND_LABELS: Record<PlannerKind, string> = { note: "Note", todo: "To-do" };

export type PlannerLinkType = "lead" | "customer" | "order" | "invoice";

/**
 * Should this entry's reminder be pushed now? Mirrors work-tasks.ts's isReminderDue, but on a
 * calendar date comparison only — delivery is a once-daily cron (see
 * src/app/api/cron/planner-reminders/route.ts), not minute-of-day precision, so "due" here means
 * "falls on today's IST date and hasn't already gone out for today." `reminderAt`'s date is read
 * through istDateString (not a naive string slice) for the same reason every other date-of-a-
 * timestamp comparison in this app does — a UTC calendar-day slice drifts by a day right around
 * IST midnight.
 */
export function isPlannerReminderDue(entry: { reminderAt: string | null; reminderSentFor: string | null }, todayIst: string): boolean {
  if (!entry.reminderAt) return false;
  if (istDateString(new Date(entry.reminderAt)) !== todayIst) return false;
  return entry.reminderSentFor !== todayIst;
}
