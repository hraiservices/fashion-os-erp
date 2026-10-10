"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { subtaskProgress } from "@/lib/work-tasks";
import type { ProjectWithProgress, TaskDto, TaskListDto } from "@/lib/targets-types";
import { useCreateTask, useCreateTaskList, useDeleteTaskList, usePatchTask, type TargetsMeta } from "@/hooks/use-targets";
import { TaskRow } from "@/components/targets/task-row";
import { TaskSheet } from "@/components/targets/task-sheet";
import { groupTasks, WorkTable } from "@/components/targets/work-table";

/** A project's tasks grouped by task list: the Zoho-style table on desktop, list cards on a phone. */
export function ProjectTasks({ project, tasks, lists, canManage, meta, nameOf }: { project: ProjectWithProgress; tasks: TaskDto[]; lists: TaskListDto[]; canManage: boolean; meta: TargetsMeta | undefined; nameOf: (id: string | null | undefined) => string }) {
  const create = useCreateTask();
  const patch = usePatchTask();
  const addList = useCreateTaskList();
  const delList = useDeleteTaskList();
  const [editing, setEditing] = useState<TaskDto | null>(null);
  const [newOpen, setNewOpen] = useState<{ taskListId: string | null } | null>(null);
  const [listName, setListName] = useState("");
  const today = meta?.today ?? "";
  const groups = useMemo(() => groupTasks(tasks, { by: "list", lists, projectId: project.id }), [tasks, lists, project.id]);
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

  function toggle(t: TaskDto) {
    patch.mutate({ id: t.id, status: t.status === "done" ? "todo" : "done" }, { onError: err });
  }
  function quickAdd(title: string, defaults: { projectId?: string | null; taskListId?: string | null }) {
    create.mutate({ title, projectId: project.id, assigneeId: meta?.me.employeeId ?? null, ...(defaults.taskListId ? { taskListId: defaults.taskListId } : {}) }, { onError: err });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-11" onClick={() => setNewOpen({ taskListId: null })}>
          <Plus className="size-4" /> Add Task
        </Button>
        {canManage && (
          <form
            className="flex flex-1 gap-2 sm:max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (listName.trim()) addList.mutate({ projectId: project.id, name: listName.trim() }, { onSuccess: () => setListName(""), onError: err });
            }}
          >
            <Input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="New task list name" className="h-11" maxLength={80} />
            <Button type="submit" variant="outline" className="h-11" disabled={!listName.trim() || addList.isPending}>
              Add list
            </Button>
          </form>
        )}
      </div>

      <div className="hidden lg:block">
        <WorkTable groups={groups} allTasks={tasks} today={today} nameOf={nameOf} projectName={() => project.name} onOpen={setEditing} onToggle={toggle} onQuickAdd={quickAdd} />
      </div>

      <div className="space-y-4 lg:hidden">
        {tasks.filter((t) => !t.parentTaskId).length === 0 && lists.length === 0 && <EmptyState title="No tasks yet" description="Tap Add Task to create the first one." />}
        {groups
          .filter((g) => g.tasks.length > 0 || g.key !== "general")
          .map((g) => (
            <section key={g.key} className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {g.title} · {g.tasks.length}
                </h2>
                <div className="flex items-center">
                  <button type="button" className="flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-primary" onClick={() => setNewOpen({ taskListId: g.defaults.taskListId ?? null })}>
                    <Plus className="size-4" /> Task
                  </button>
                  {canManage && g.key !== "general" && (
                    <button type="button" aria-label={`Delete list ${g.title}`} className="flex size-11 items-center justify-center text-muted-foreground" onClick={() => delList.mutate(g.key, { onError: err })}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
              {g.tasks.length > 0 && (
                <div className="overflow-hidden rounded-xl border bg-card">
                  {g.tasks.map((t) => {
                    const sp = subtaskProgress(t.id, tasks);
                    return <TaskRow key={t.id} task={t} today={today} assigneeName={nameOf(t.assigneeId)} subDone={sp.done} subTotal={sp.total} onToggle={toggle} onOpen={setEditing} busy={patch.isPending} />;
                  })}
                </div>
              )}
            </section>
          ))}
      </div>

      <TaskSheet open={!!newOpen} onOpenChange={(o) => !o && setNewOpen(null)} meta={meta} projects={[project]} defaults={{ projectId: project.id, taskListId: newOpen?.taskListId ?? null }} />
      <TaskSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} meta={meta} projects={[project]} task={editing} />
    </div>
  );
}
