"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateShort } from "@/lib/format";
import { daysBetween } from "@/lib/targets";
import { isFinished, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskPriority, type TaskStatus } from "@/lib/work-tasks";

/** Small display pieces shared by the task table, task panel and project screens. */

/** Solid coloured status cell, like Zoho's table. */
export const STATUS_CELL: Record<string, string> = {
  todo: "bg-emerald-500 text-white",
  in_progress: "bg-sky-500 text-white",
  blocked: "bg-red-500 text-white",
  done: "bg-slate-500 text-white",
  cancelled: "bg-zinc-400 text-white",
};

export function StatusCell({ status, className }: { status: string; className?: string }) {
  return <span className={cn("inline-flex min-w-20 items-center justify-center rounded px-2.5 py-1.5 text-xs font-semibold", STATUS_CELL[status] ?? STATUS_CELL.todo, className)}>{TASK_STATUS_LABELS[status as TaskStatus] ?? status}</span>;
}

const PRIORITY_COLOR: Record<string, string> = { urgent: "text-red-600", high: "text-red-500", medium: "text-amber-500", low: "text-emerald-600" };

export function PriorityMark({ priority }: { priority: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <AlertCircle className={cn("size-3.5", PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.medium)} />
      {TASK_PRIORITY_LABELS[priority as TaskPriority] ?? priority}
    </span>
  );
}

/** "09 Jul" normally; red "09 Jul (67 days ago)" when an open task is past due. */
export function DueText({ due, status, today }: { due: string | null; status: string; today: string }) {
  if (!due) return <span className="text-muted-foreground">–</span>;
  const late = !isFinished(status) && due < today;
  const days = late ? daysBetween(due, today) : 0;
  return (
    <span className={cn("whitespace-nowrap", late && "text-red-600 dark:text-red-400")}>
      {fmtDateShort(due)}
      {late && <span className="ml-1 text-xs">({days} day{days === 1 ? "" : "s"} ago)</span>}
    </span>
  );
}

export const taskCode = (taskNo: number | null) => (taskNo != null ? `T-${taskNo}` : "");
export const projectCode = (projectNo: number | null) => (projectNo != null ? `P-${projectNo}` : "");

export function CompletionBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px]">
          {t}
        </span>
      ))}
    </span>
  );
}

export const REMINDER_LABELS: Record<string, string> = { none: "None", on_due: "On the due date", "1_day": "1 day before", "2_days": "2 days before", "1_week": "1 week before" };
