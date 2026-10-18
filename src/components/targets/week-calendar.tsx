"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isFinished, addDaysIso } from "@/lib/work-tasks";
import { TRIAL_TAG } from "@/lib/trial";
import { isSequenceTask } from "@/lib/lead-sequences";
import type { TaskDto } from "@/lib/targets-types";
import { cn } from "@/lib/utils";

/**
 * The week at a glance: every task with a due date, in the day it falls on — lead follow-ups,
 * fitting trials, project work and shop routines together. Phones get the seven days stacked;
 * from `sm` up it is a seven-column grid. Tapping anything opens the usual task panel.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The Monday of the week `date` falls in. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysIso(date, day === 0 ? -6 : 1 - day);
}

type Kind = "lead" | "trial" | "project" | "other";

const KIND_CLASS: Record<Kind, string> = {
  lead: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  trial: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200",
  project: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  other: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
};

const KIND_LABEL: Record<Kind, string> = { lead: "Lead follow-ups", trial: "Fitting trials", project: "Project work", other: "Other tasks" };

export function taskKind(task: TaskDto): Kind {
  if ((task.tags ?? []).includes(TRIAL_TAG)) return "trial";
  if (task.linkType === "lead" || isSequenceTask(task.tags)) return "lead";
  if (task.projectId) return "project";
  return "other";
}

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function WeekCalendar({ tasks, today, onOpen }: { tasks: TaskDto[]; today: string; onOpen: (task: TaskDto) => void }) {
  const [start, setStart] = useState(() => weekStart(today || new Date().toISOString().slice(0, 10)));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysIso(start, i)), [start]);

  const byDay = useMemo(() => {
    const map = new Map<string, TaskDto[]>();
    for (const t of tasks) {
      if (!t.dueDate || t.parentTaskId) continue;
      map.set(t.dueDate, [...(map.get(t.dueDate) ?? []), t]);
    }
    return map;
  }, [tasks]);

  const shown = days.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);
  const end = days[6];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label="Previous week" onClick={() => setStart(addDaysIso(start, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label="Next week" onClick={() => setStart(addDaysIso(start, 7))}>
          <ChevronRight className="size-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {dayLabel(start)} – {dayLabel(end)}
        </p>
        <Button type="button" variant="outline" className="h-11" onClick={() => setStart(weekStart(today))}>
          This week
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full border", KIND_CLASS[k])} aria-hidden />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((d, i) => {
          const items = (byDay.get(d) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title));
          const isToday = d === today;
          const past = d < today;
          return (
            <div key={d} className={cn("min-w-0 rounded-xl border p-2", isToday ? "border-primary bg-primary/5" : past ? "bg-muted/30" : "bg-card")}>
              <p className={cn("mb-1.5 flex items-baseline justify-between gap-1 text-xs font-semibold", isToday ? "text-primary" : "text-muted-foreground")}>
                <span>
                  {DAY_NAMES[i]} {Number(d.slice(8, 10))}
                </span>
                {items.length > 0 && <span className="tabular-nums">{items.length}</span>}
              </p>
              {items.length === 0 ? (
                <p className="py-1 text-xs text-muted-foreground sm:min-h-16">—</p>
              ) : (
                <ul className="space-y-1 sm:min-h-16">
                  {items.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(t)}
                        className={cn(
                          "w-full rounded-lg border px-2 py-1.5 text-left text-xs leading-snug sm:min-h-0",
                          "min-h-11",
                          KIND_CLASS[taskKind(t)],
                          isFinished(t.status) && "opacity-55 line-through",
                          !isFinished(t.status) && past && "ring-1 ring-red-400"
                        )}
                      >
                        <span className="line-clamp-2 font-medium">{t.title}</span>
                        {t.linkLabel && <span className="mt-0.5 block truncate opacity-80">{t.linkLabel}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {shown === 0 ? "Nothing due this week." : `${shown} ${shown === 1 ? "task" : "tasks"} this week. Tap one to open it, where you can change its date.`}
      </p>
    </section>
  );
}
