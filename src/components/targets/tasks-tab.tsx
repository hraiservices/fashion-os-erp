"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bucketTasks, isOverdue, subtaskProgress } from "@/lib/work-tasks";
import type { TaskDto } from "@/lib/targets-types";
import { useCreateTask, usePatchTask, useProjects, useTasks, type TargetsMeta } from "@/hooks/use-targets";
import { useStaffLookup } from "@/components/targets/shared";
import { TaskRow } from "@/components/targets/task-row";
import { TaskSheet } from "@/components/targets/task-sheet";
import { groupTasks, WorkTable } from "@/components/targets/work-table";
import { cn } from "@/lib/utils";

type View = "open" | "today" | "overdue" | "done";
const ALL = "all";
const VIEW_LABEL: Record<View, string> = { open: "All open", today: "Due today", overdue: "Overdue", done: "Done" };

function Group({ title, tone, children }: { title: string; tone?: "late"; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className={cn("px-1 text-sm font-semibold", tone === "late" ? "text-red-600" : "text-muted-foreground")}>{title}</h2>
      <div className="overflow-hidden rounded-xl border bg-card">{children}</div>
    </section>
  );
}

/**
 * Tasks: the Zoho-style table on desktop (grouped by project, click a row for the side panel) and
 * tick-circle cards on a phone (overdue → due today → coming up). Same data and filters on both.
 */
export function TasksTab({ meta, taskSheetOpen, onTaskSheetOpenChange }: { meta: TargetsMeta | undefined; taskSheetOpen: boolean; onTaskSheetOpenChange: (o: boolean) => void }) {
  const [view, setView] = useState<View>("open");
  const [person, setPerson] = useState(ALL);
  const [projectFilter, setProjectFilter] = useState(ALL);
  const [quick, setQuick] = useState("");
  const [editing, setEditing] = useState<TaskDto | null>(null);

  const today = meta?.today ?? "";
  const { nameOf, active } = useStaffLookup(meta);
  const tasksQ = useTasks({ status: view === "done" ? "done" : "open", assignee: meta?.can.viewAll && person !== ALL ? person : undefined, project: projectFilter !== ALL ? projectFilter : undefined });
  const projects = useProjects().data ?? [];
  const create = useCreateTask();
  const patch = usePatchTask();
  const showAssignee = !!meta?.can.viewAll;
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "Project";

  const all = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const visible = useMemo(() => {
    if (view === "today") return all.filter((t) => t.dueDate === today || isOverdue(t, today));
    if (view === "overdue") return all.filter((t) => isOverdue(t, today));
    return all;
  }, [all, view, today]);
  const topLevel = useMemo(() => visible.filter((t) => !t.parentTaskId), [visible]);
  const buckets = useMemo(() => bucketTasks(topLevel, today), [topLevel, today]);
  const groups = useMemo(() => groupTasks(visible, { by: "project", projectName }), [visible, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(t: TaskDto) {
    patch.mutate({ id: t.id, status: t.status === "done" ? "todo" : "done" }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update the task") });
  }

  function quickAdd(title: string, defaults?: { projectId?: string | null; taskListId?: string | null }) {
    create.mutate(
      { title, dueDate: view === "today" ? today : null, assigneeId: meta?.me.employeeId ?? null, ...(defaults?.projectId ? { projectId: defaults.projectId } : {}), ...(defaults?.taskListId ? { taskListId: defaults.taskListId } : {}) },
      { onSuccess: () => setQuick(""), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add the task") }
    );
  }

  const row = (t: TaskDto) => {
    const sp = subtaskProgress(t.id, all);
    return <TaskRow key={t.id} task={t} today={today} assigneeName={showAssignee ? nameOf(t.assigneeId) : undefined} subDone={sp.done} subTotal={sp.total} onToggle={toggle} onOpen={setEditing} busy={patch.isPending} />;
  };

  const chip = (v: View) => (
    <button key={v} type="button" onClick={() => setView(v)} className={cn("min-h-11 w-full rounded-full border px-4 text-sm font-medium lg:w-auto lg:shrink-0", view === v ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
      {VIEW_LABEL[v]}
    </button>
  );
  const filterLabel = "text-xs font-medium text-muted-foreground";

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="grid grid-cols-2 items-end gap-2 lg:flex lg:flex-wrap">
        {(["open", "today", "overdue", "done"] as const).map(chip)}
        {projects.length > 0 && (
          <div className="hidden space-y-1 lg:block lg:w-48">
            <Label className={filterLabel}>Project</Label>
            <Select value={projectFilter} onValueChange={(v) => v && setProjectFilter(v)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue>{(v: unknown) => (v === ALL ? "All projects" : projectName(v as string))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {showAssignee && (
          <div className="col-span-2 space-y-1 lg:w-44">
            <Label className={cn(filterLabel, "hidden lg:block")}>Owner</Label>
            <Select value={person} onValueChange={(v) => v && setPerson(v)}>
              <SelectTrigger className="h-11 w-full lg:w-full">
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
          </div>
        )}
        <Button className="ml-auto hidden h-11 lg:inline-flex" onClick={() => onTaskSheetOpenChange(true)}>
          <Plus className="size-4" /> Add Task
        </Button>
      </div>

      {tasksQ.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Desktop: Zoho-style table */}
      {!tasksQ.isLoading && (
        <div className="hidden lg:block">
          {topLevel.length === 0 && view !== "open" ? (
            <EmptyState title={`Nothing ${view === "done" ? "finished yet" : view === "today" ? "due today" : "overdue"}`} />
          ) : (
            <WorkTable
              groups={groups.length ? groups : [{ key: "none", title: "No project", tasks: [], defaults: {} }]}
              allTasks={all}
              today={today}
              nameOf={nameOf}
              showProject
              projectName={projectName}
              onOpen={setEditing}
              onToggle={toggle}
              onQuickAdd={view === "done" ? undefined : quickAdd}
            />
          )}
        </div>
      )}

      {/* Phone: cards */}
      {!tasksQ.isLoading && (
        <div className="space-y-4 lg:hidden">
          {view !== "done" && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (quick.trim()) quickAdd(quick.trim());
              }}
            >
              <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a task…" className="h-12 text-base" maxLength={200} />
              <Button type="submit" className="h-12 w-12 shrink-0 px-0" aria-label="Add task" disabled={!quick.trim() || create.isPending}>
                <Plus className="size-5" />
              </Button>
            </form>
          )}
          {view === "done" ? (
            topLevel.length ? <Group title={`Finished · ${topLevel.length}`}>{topLevel.map(row)}</Group> : <EmptyState title="Nothing finished yet" />
          ) : (
            <>
              {buckets.overdue.length > 0 && <Group title={`Overdue · ${buckets.overdue.length}`} tone="late">{buckets.overdue.map(row)}</Group>}
              {buckets.dueToday.length > 0 && <Group title={`Due today · ${buckets.dueToday.length}`}>{buckets.dueToday.map(row)}</Group>}
              {view === "open" && buckets.upcoming.length > 0 && <Group title={`Coming up · ${buckets.upcoming.length}`}>{buckets.upcoming.map(row)}</Group>}
              {view === "open" && buckets.noDate.length > 0 && <Group title={`No date · ${buckets.noDate.length}`}>{buckets.noDate.map(row)}</Group>}
              {topLevel.length === 0 && <EmptyState title={view === "open" ? "No open tasks" : view === "today" ? "Nothing due today 🎉" : "Nothing overdue 🎉"} description="Add one above." />}
            </>
          )}
        </div>
      )}

      <TaskSheet open={taskSheetOpen || !!editing} onOpenChange={(o) => { if (!o) { setEditing(null); onTaskSheetOpenChange(false); } }} meta={meta} projects={projects} task={editing} />
    </div>
  );
}
