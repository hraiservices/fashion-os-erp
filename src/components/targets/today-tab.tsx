"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bucketTasks, projectProgress, subtaskProgress } from "@/lib/work-tasks";
import type { ProjectDto, TaskDto } from "@/lib/targets-types";
import { useCreateTask, usePatchTask, useProjects, useTasks, type TargetsMeta } from "@/hooks/use-targets";
import { useStaffLookup } from "@/components/targets/shared";
import { TaskRow } from "@/components/targets/task-row";
import { TaskSheet } from "@/components/targets/task-sheet";
import { ProjectFormSheet } from "@/components/targets/project-form-sheet";
import { fmtDateShort } from "@/lib/format";
import { PROJECT_STATUS_LABELS } from "@/lib/work-tasks";
import { cn } from "@/lib/utils";

type View = "today" | "all" | "projects";
const ALL = "all";

function Group({ title, tone, children }: { title: string; tone?: "late"; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className={cn("px-1 text-sm font-semibold", tone === "late" ? "text-red-600" : "text-muted-foreground")}>{title}</h2>
      <div className="overflow-hidden rounded-xl border bg-card">{children}</div>
    </section>
  );
}

/**
 * Today: what needs doing now. Overdue first, then due today, then everything else with a date.
 * Chips switch to every open task, or to Projects. Typing in the quick-add box adds a task due
 * today in one go; the big + (owned by the page) opens the full forms.
 */
export function TodayTab({ meta, taskSheetOpen, onTaskSheetOpenChange }: { meta: TargetsMeta | undefined; taskSheetOpen: boolean; onTaskSheetOpenChange: (o: boolean) => void }) {
  const [view, setView] = useState<View>("today");
  const [person, setPerson] = useState(ALL);
  const [quick, setQuick] = useState("");
  const [editing, setEditing] = useState<TaskDto | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);

  const today = meta?.today ?? "";
  const { nameOf, active } = useStaffLookup(meta);
  const tasksQ = useTasks({ status: "open", assignee: meta?.can.viewAll && person !== ALL ? person : undefined });
  const projectsQ = useProjects();
  const create = useCreateTask();
  const patch = usePatchTask();
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const topLevel = useMemo(() => tasks.filter((t) => !t.parentTaskId), [tasks]);
  const projects = projectsQ.data ?? [];

  const buckets = useMemo(() => bucketTasks(topLevel, today), [topLevel, today]);
  const showAssignee = !!meta?.can.viewAll;

  function toggle(t: TaskDto) {
    patch.mutate({ id: t.id, status: t.status === "done" ? "todo" : "done" }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update the task") });
  }

  function quickAdd() {
    const title = quick.trim();
    if (!title) return;
    create.mutate(
      { title, dueDate: today, assigneeId: meta?.me.employeeId ?? null },
      { onSuccess: () => setQuick(""), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add the task") }
    );
  }

  const row = (t: TaskDto) => {
    const sp = subtaskProgress(t.id, tasks);
    return <TaskRow key={t.id} task={t} today={today} assigneeName={showAssignee ? nameOf(t.assigneeId) : undefined} subDone={sp.done} subTotal={sp.total} onToggle={toggle} onOpen={setEditing} busy={patch.isPending} />;
  };

  const chip = (v: View, label: string, count?: number) => (
    <button key={v} type="button" onClick={() => setView(v)} className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium", view === v ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card")}>
      {label}
      {!!count && <span className="ml-1.5 text-xs opacity-70">{count}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {chip("today", "Today", buckets.overdue.length + buckets.dueToday.length)}
        {chip("all", "All tasks", topLevel.length)}
        {chip("projects", "Projects", projects.filter((p) => p.status === "active").length)}
        {showAssignee && view !== "projects" && (
          <Select value={person} onValueChange={(v) => v && setPerson(v)}>
            <SelectTrigger className="ml-auto h-11 w-40 shrink-0">
              <SelectValue>{(v: unknown) => (v === ALL ? "Everyone" : nameOf(v as string))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              {active.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {view !== "projects" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            quickAdd();
          }}
        >
          <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a task for today…" className="h-12 text-base" maxLength={200} />
          <Button type="submit" className="h-12 w-12 shrink-0 px-0" aria-label="Add task" disabled={!quick.trim() || create.isPending}>
            <Plus className="size-5" />
          </Button>
        </form>
      )}

      {view !== "projects" && tasksQ.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {view === "today" && !tasksQ.isLoading && (
        <div className="space-y-4">
          {buckets.overdue.length > 0 && <Group title={`Overdue · ${buckets.overdue.length}`} tone="late">{buckets.overdue.map(row)}</Group>}
          {buckets.dueToday.length > 0 && <Group title={`Due today · ${buckets.dueToday.length}`}>{buckets.dueToday.map(row)}</Group>}
          {buckets.overdue.length + buckets.dueToday.length === 0 && <EmptyState title="Nothing due today 🎉" description="Add a task above, or look at All tasks for what's coming." />}
        </div>
      )}

      {view === "all" && !tasksQ.isLoading && (
        <div className="space-y-4">
          {buckets.overdue.length > 0 && <Group title={`Overdue · ${buckets.overdue.length}`} tone="late">{buckets.overdue.map(row)}</Group>}
          {buckets.dueToday.length > 0 && <Group title={`Due today · ${buckets.dueToday.length}`}>{buckets.dueToday.map(row)}</Group>}
          {buckets.upcoming.length > 0 && <Group title={`Coming up · ${buckets.upcoming.length}`}>{buckets.upcoming.map(row)}</Group>}
          {buckets.noDate.length > 0 && <Group title={`No date · ${buckets.noDate.length}`}>{buckets.noDate.map(row)}</Group>}
          {topLevel.length === 0 && <EmptyState title="No open tasks" description="Add one above." />}
        </div>
      )}

      {view === "projects" && (
        <div className="space-y-3">
          {meta?.can.manageTargets && (
            <Button variant="outline" className="h-12 w-full" onClick={() => setProjectOpen(true)}>
              <Plus className="size-4" /> New project
            </Button>
          )}
          {projectsQ.isLoading && <Skeleton className="h-24 w-full rounded-xl" />}
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          {!projectsQ.isLoading && projects.length === 0 && <EmptyState title="No projects yet" description="A project groups tasks that share a goal and a date range." />}
        </div>
      )}

      <TaskSheet open={taskSheetOpen || !!editing} onOpenChange={(o) => { if (!o) { setEditing(null); onTaskSheetOpenChange(false); } }} meta={meta} projects={projects} task={editing} />
      <ProjectFormSheet open={projectOpen} onOpenChange={setProjectOpen} meta={meta} />
    </div>
  );
}

function ProjectCard({ project: p }: { project: ProjectDto & { progress?: ReturnType<typeof projectProgress>; overdueTasks?: number } }) {
  const pct = p.progress?.pct ?? 0;
  return (
    <Link href={`/targets/projects/${p.id}`} className="block rounded-xl border bg-card p-4 active:bg-muted/50">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-base font-semibold">{p.name}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{PROJECT_STATUS_LABELS[p.status as keyof typeof PROJECT_STATUS_LABELS] ?? p.status}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {pct}% done · {p.progress?.done ?? 0}/{p.progress?.total ?? 0} tasks
        {p.endDate && <> · ends {fmtDateShort(p.endDate)}</>}
        {!!p.overdueTasks && <span className="font-semibold text-red-600"> · {p.overdueTasks} overdue</span>}
      </p>
    </Link>
  );
}
