import { daysBetween } from "@/lib/targets";
import { isDueToday, isFinished, isOverdue } from "@/lib/work-tasks";

/** Pure builders for the Targets reports that aren't already covered by targets.ts. */

export interface TaskForReport {
  assigneeId: string | null;
  status: string;
  dueDate: string | null;
  /** YYYY-MM-DD the task was completed, if it was. */
  completedDate: string | null;
}

export interface TaskLoadRow {
  assigneeId: string | null;
  open: number;
  dueToday: number;
  overdue: number;
  doneInRange: number;
  /** Days the longest-overdue open task is late, or null when none is. */
  oldestOverdueDays: number | null;
}

/** Open / due today / overdue / finished-in-range per person, most overdue first. */
export function buildTaskLoad(tasks: TaskForReport[], today: string, range: { from: string; to: string }): TaskLoadRow[] {
  const rows = new Map<string | null, TaskLoadRow>();
  const row = (id: string | null) => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { assigneeId: id, open: 0, dueToday: 0, overdue: 0, doneInRange: 0, oldestOverdueDays: null }));
    return r;
  };
  for (const t of tasks) {
    const r = row(t.assigneeId);
    if (t.status === "done" && t.completedDate && t.completedDate >= range.from && t.completedDate <= range.to) r.doneInRange += 1;
    if (isFinished(t.status)) continue;
    r.open += 1;
    if (isDueToday(t, today)) r.dueToday += 1;
    if (isOverdue(t, today)) {
      r.overdue += 1;
      const late = daysBetween(t.dueDate as string, today);
      r.oldestOverdueDays = Math.max(r.oldestOverdueDays ?? 0, late);
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}

export interface AgeBucket {
  label: string;
  count: number;
}

/** How late the overdue tasks are: 1–3 days, 4–7, 8–14, 15+. */
export function overdueAgeBuckets(tasks: Pick<TaskForReport, "status" | "dueDate">[], today: string): AgeBucket[] {
  const buckets: AgeBucket[] = [
    { label: "1–3 days late", count: 0 },
    { label: "4–7 days late", count: 0 },
    { label: "8–14 days late", count: 0 },
    { label: "15+ days late", count: 0 },
  ];
  for (const t of tasks) {
    if (!isOverdue(t, today)) continue;
    const late = daysBetween(t.dueDate as string, today);
    buckets[late <= 3 ? 0 : late <= 7 ? 1 : late <= 14 ? 2 : 3].count += 1;
  }
  return buckets;
}

/** Whether two inclusive date ranges overlap — used to pick the targets a report period covers. */
export function rangesOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && a.end >= b.start;
}
