"use client";

import { Check, ListChecks, Folder, Link2, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskDto } from "@/lib/targets-types";
import { checklistProgress } from "@/lib/work-tasks";
import { dueLabel, DUE_TONE_CLASS } from "@/components/targets/shared";

const PRIORITY_BAR: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-transparent",
  low: "bg-transparent",
};

/**
 * One task: a big tick circle (44px hit area) on the left, title and quick facts in the middle,
 * due date on the right. Tapping the row opens the task; tapping the circle finishes it.
 */
export function TaskRow({
  task,
  today,
  assigneeName,
  subDone,
  subTotal,
  onToggle,
  onOpen,
  busy,
}: {
  task: TaskDto;
  today: string;
  assigneeName?: string;
  subDone?: number;
  subTotal?: number;
  onToggle: (task: TaskDto) => void;
  onOpen: (task: TaskDto) => void;
  busy?: boolean;
}) {
  const done = task.status === "done";
  const due = task.dueDate && !done ? dueLabel(task.dueDate, today) : null;
  const check = checklistProgress(task.checklist);

  return (
    <div className="relative flex items-stretch border-b last:border-b-0">
      <span className={cn("absolute inset-y-2 left-0 w-1 rounded-r", PRIORITY_BAR[task.priority] ?? "bg-transparent")} aria-hidden />
      <button type="button" onClick={() => onToggle(task)} disabled={busy} aria-label={done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`} className="flex min-h-14 w-14 shrink-0 items-center justify-center disabled:opacity-50">
        <span className={cn("flex size-7 items-center justify-center rounded-full border-2 transition-colors", done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40 bg-card")}>{done && <Check className="size-4" strokeWidth={3} />}</span>
      </button>
      <button type="button" onClick={() => onOpen(task)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pr-4 text-left active:bg-muted/40">
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-base leading-snug", done && "text-muted-foreground line-through")}>{task.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
            {task.linkType === "lead" && task.linkLabel && (
              <span className="inline-flex items-center gap-1">
                <Link2 className="size-3" />
                {task.linkLabel}
              </span>
            )}
            {task.groupName && (
              <span className="inline-flex items-center gap-1">
                <Folder className="size-3" />
                {task.groupName}
              </span>
            )}
            {assigneeName && <span>{assigneeName}</span>}
            {!!subTotal && (
              <span className="inline-flex items-center gap-1">
                <ListTree className="size-3" />
                {subDone}/{subTotal}
              </span>
            )}
            {check.total > 0 && (
              <span className="inline-flex items-center gap-1">
                <ListChecks className="size-3" />
                {check.done}/{check.total}
              </span>
            )}
            {task.status === "blocked" && <span className="font-semibold text-red-600">Blocked</span>}
            {task.status === "in_progress" && <span className="font-semibold text-sky-600">In progress</span>}
          </p>
        </div>
        {due && <span className={cn("shrink-0 text-sm", DUE_TONE_CLASS[due.tone])}>{due.text}</span>}
      </button>
    </div>
  );
}
