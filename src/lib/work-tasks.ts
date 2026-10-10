/** Task and project helpers for the Targets module — pure, so the rules are unit-tested. */

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "done", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
  done: "Done",
  cancelled: "Cancelled",
};

export type TaskLinkType = "lead" | "target" | "customer" | "order" | "invoice";

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface TaskLike {
  id: string;
  status: string;
  dueDate: string | null;
  assigneeId: string | null;
  createdBy: string | null;
  projectId?: string | null;
  parentTaskId?: string | null;
  priority?: string;
}

const FINISHED: readonly string[] = ["done", "cancelled"];

export const isFinished = (status: string) => FINISHED.includes(status);

export function isOverdue(task: Pick<TaskLike, "status" | "dueDate">, today: string): boolean {
  return !!task.dueDate && task.dueDate < today && !isFinished(task.status);
}

export function isDueToday(task: Pick<TaskLike, "status" | "dueDate">, today: string): boolean {
  return task.dueDate === today && !isFinished(task.status);
}

/** Sort: overdue first, then by due date (no date last), then urgent before low. */
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export function compareTasks(a: TaskLike, b: TaskLike): number {
  const ad = a.dueDate || "9999-12-31";
  const bd = b.dueDate || "9999-12-31";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return (PRIORITY_RANK[a.priority || "medium"] ?? 2) - (PRIORITY_RANK[b.priority || "medium"] ?? 2);
}

export interface TaskBuckets<T> {
  overdue: T[];
  dueToday: T[];
  upcoming: T[];
  noDate: T[];
  done: T[];
}

/** Groups open tasks for the Today screen. Subtasks are shown under their parent, not here. */
export function bucketTasks<T extends TaskLike>(tasks: T[], today: string): TaskBuckets<T> {
  const out: TaskBuckets<T> = { overdue: [], dueToday: [], upcoming: [], noDate: [], done: [] };
  for (const t of tasks) {
    if (t.parentTaskId) continue;
    if (isFinished(t.status)) out.done.push(t);
    else if (isOverdue(t, today)) out.overdue.push(t);
    else if (isDueToday(t, today)) out.dueToday.push(t);
    else if (t.dueDate) out.upcoming.push(t);
    else out.noDate.push(t);
  }
  for (const k of ["overdue", "dueToday", "upcoming", "noDate"] as const) out[k].sort(compareTasks);
  return out;
}

/** Who may see a task: the person it's for, whoever created it, or anyone who sees everything. */
export function taskVisibleTo(task: Pick<TaskLike, "assigneeId" | "createdBy">, viewer: { employeeId: string | null; email: string; seesAll: boolean }): boolean {
  if (viewer.seesAll) return true;
  if (viewer.employeeId && task.assigneeId === viewer.employeeId) return true;
  return !!task.createdBy && task.createdBy.toLowerCase() === viewer.email.toLowerCase();
}

/**
 * Whether the viewer may give a task to `assigneeId`. Without the assign permission a person can
 * only create tasks for themselves (or leave them unassigned).
 */
export function canAssignTo(assigneeId: string | null, viewer: { employeeId: string | null; canAssignOthers: boolean }): boolean {
  if (viewer.canAssignOthers) return true;
  return assigneeId === null || assigneeId === viewer.employeeId;
}

export function checklistProgress(items: ChecklistItem[] | null | undefined): { done: number; total: number } {
  const list = Array.isArray(items) ? items : [];
  return { done: list.filter((i) => i && i.done).length, total: list.length };
}

/** Normalises whatever came out of the jsonb column into clean checklist items. */
export function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i) => ({ text: String((i as { text?: unknown })?.text ?? "").trim().slice(0, 200), done: !!(i as { done?: unknown })?.done }))
    .filter((i) => i.text)
    .slice(0, 50);
}

export function subtaskProgress<T extends TaskLike>(parentId: string, tasks: T[]): { done: number; total: number } {
  const subs = tasks.filter((t) => t.parentTaskId === parentId && t.status !== "cancelled");
  return { done: subs.filter((t) => t.status === "done").length, total: subs.length };
}

/** % complete of a project from its tasks (cancelled tasks and subtasks' parents excluded from the count). */
export function projectProgress(tasks: Pick<TaskLike, "status">[]): { done: number; total: number; pct: number } {
  const counted = tasks.filter((t) => t.status !== "cancelled");
  const done = counted.filter((t) => t.status === "done").length;
  return { done, total: counted.length, pct: counted.length ? Math.round((done / counted.length) * 100) : 0 };
}

export function isProjectOverdue(project: { endDate: string | null; status: string }, today: string): boolean {
  return !!project.endDate && project.endDate < today && !["done", "cancelled"].includes(project.status);
}
