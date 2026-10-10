"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_STATUSES, type ChecklistItem } from "@/lib/work-tasks";
import type { ProjectWithProgress, TaskDto } from "@/lib/targets-types";
import { useCreateTask, useDeleteTask, usePatchTask, useTask, type TargetsMeta, type TaskInput } from "@/hooks/use-targets";
import { cn } from "@/lib/utils";

const NONE = "none";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Create or edit a task in a bottom sheet. Quick date chips (Today / Tomorrow / Next week) cover
 * most tasks in one tap. Staff without "assign tasks" see "For: you" instead of a person picker.
 * `defaults` pre-fills a new task (e.g. a follow-up linked to a lead, or a task inside a project).
 */
export function TaskSheet({
  open,
  onOpenChange,
  meta,
  projects,
  task,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: TargetsMeta | undefined;
  projects: ProjectWithProgress[];
  /** Edit this task. Omit to create a new one. */
  task?: TaskDto | null;
  defaults?: Partial<TaskInput> & { linkLabel?: string | null };
}) {
  const create = useCreateTask();
  const patch = usePatchTask();
  const del = useDeleteTask();
  const detail = useTask(open && task ? task.id : null);
  const subtasks = detail.data?.subtasks ?? [];

  const today = meta?.today ?? new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string>("");
  const [assignee, setAssignee] = useState<string>(NONE);
  const [priority, setPriority] = useState<string>("medium");
  const [status, setStatus] = useState<string>("todo");
  const [projectId, setProjectId] = useState<string>(NONE);
  const [group, setGroup] = useState("");
  const [description, setDescription] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newSub, setNewSub] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canAssign = !!meta?.can.assignTasks;
  const staff = (meta?.staff ?? []).filter((s) => s.active);
  const busy = create.isPending || patch.isPending || del.isPending;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the sheet opens
    setConfirmDelete(false);
    setNewItem("");
    setNewSub("");
    setTitle(task?.title ?? defaults?.title ?? "");
    setDue(task ? task.dueDate ?? "" : defaults?.dueDate ?? "");
    setAssignee(task ? task.assigneeId ?? NONE : defaults?.assigneeId ?? meta?.me.employeeId ?? NONE);
    setPriority(task?.priority ?? defaults?.priority ?? "medium");
    setStatus(task?.status ?? "todo");
    setProjectId(task ? task.projectId ?? NONE : defaults?.projectId ?? NONE);
    setGroup(task?.groupName ?? defaults?.groupName ?? "");
    setDescription(task?.description ?? "");
    setChecklist(task?.checklist ?? []);
  }, [open, task, defaults, meta?.me.employeeId]);

  const linkType = task?.linkType ?? defaults?.linkType ?? null;
  const linkId = task?.linkId ?? defaults?.linkId ?? null;
  const linkLabel = task?.linkLabel ?? defaults?.linkLabel ?? null;

  function save() {
    if (!title.trim()) return;
    const payload: TaskInput = {
      title: title.trim(),
      description: description.trim(),
      projectId: projectId === NONE ? null : projectId,
      groupName: group.trim(),
      assigneeId: assignee === NONE ? null : assignee,
      priority,
      dueDate: due || null,
      checklist: checklist.filter((c) => c.text.trim()),
    };
    const ok = (msg: string) => {
      toast.success(msg);
      onOpenChange(false);
    };
    const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't save the task");
    if (task) patch.mutate({ id: task.id, ...payload, status }, { onSuccess: () => ok("Task saved"), onError: fail });
    else create.mutate({ ...payload, status, linkType, linkId, parentTaskId: defaults?.parentTaskId ?? null }, { onSuccess: () => ok("Task added"), onError: fail });
  }

  function addSubtask() {
    if (!task || !newSub.trim()) return;
    create.mutate(
      { title: newSub.trim(), parentTaskId: task.id, projectId: task.projectId, assigneeId: task.assigneeId, dueDate: task.dueDate },
      { onSuccess: () => setNewSub(""), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add the subtask") }
    );
  }

  const chip = (active: boolean) => cn("min-h-11 rounded-full border px-4 text-sm font-medium", active ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{task ? "Task" : "New task"}</SheetTitle>
        </SheetHeader>

        <form
          className="space-y-5 px-4 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input autoFocus={!task} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" className="h-12 text-base" maxLength={200} />

          {linkType === "lead" && linkId && (
            <p className="text-sm text-muted-foreground">
              Follow-up for{" "}
              <Link href={`/targets/leads/${linkId}`} className="font-semibold text-primary" onClick={() => onOpenChange(false)}>
                {linkLabel || "this lead"}
              </Link>
            </p>
          )}

          <div className="space-y-2">
            <Label className="text-sm">When</Label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip(due === today)} onClick={() => setDue(today)}>
                Today
              </button>
              <button type="button" className={chip(due === addDays(today, 1))} onClick={() => setDue(addDays(today, 1))}>
                Tomorrow
              </button>
              <button type="button" className={chip(due === addDays(today, 7))} onClick={() => setDue(addDays(today, 7))}>
                Next week
              </button>
              <button type="button" className={chip(!due)} onClick={() => setDue("")}>
                No date
              </button>
            </div>
            <DatePicker value={due} onChange={setDue} placeholder="Or pick a date" className="h-12 w-full" />
          </div>

          {canAssign ? (
            <div className="space-y-1.5">
              <Label className="text-sm">For</Label>
              <Select value={assignee} onValueChange={(v) => v && setAssignee(v)}>
                <SelectTrigger className="h-12 w-full">
                  <SelectValue>{(v: unknown) => (v === NONE ? "Nobody yet" : staff.find((s) => s.id === v)?.name ?? "Choose")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nobody yet</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">For: you</p>
          )}

          <div className="space-y-2">
            <Label className="text-sm">How urgent?</Label>
            <div className="grid grid-cols-4 gap-2">
              {TASK_PRIORITIES.map((p) => (
                <button key={p} type="button" onClick={() => setPriority(p)} className={cn("min-h-11 rounded-lg border text-sm", priority === p ? (p === "urgent" ? "border-red-500 bg-red-50 font-semibold text-red-700 dark:bg-red-950 dark:text-red-300" : "border-primary bg-primary/10 font-semibold text-primary") : "bg-card")}>
                  {TASK_PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {task && (
            <div className="space-y-2">
              <Label className="text-sm">Status</Label>
              <div className="flex flex-wrap gap-2">
                {TASK_STATUSES.map((s) => (
                  <button key={s} type="button" onClick={() => setStatus(s)} className={chip(status === s)}>
                    {TASK_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Checklist */}
          <div className="space-y-2">
            <Label className="text-sm">Checklist</Label>
            {checklist.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" aria-label="Toggle item" onClick={() => setChecklist(checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} className="flex size-11 shrink-0 items-center justify-center">
                  <span className={cn("flex size-6 items-center justify-center rounded border-2", c.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40")}>{c.done && <Check className="size-4" strokeWidth={3} />}</span>
                </button>
                <span className={cn("min-w-0 flex-1 truncate text-base", c.done && "text-muted-foreground line-through")}>{c.text}</span>
                <button type="button" aria-label="Remove item" onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newItem.trim()) {
                    e.preventDefault();
                    setChecklist([...checklist, { text: newItem.trim(), done: false }]);
                    setNewItem("");
                  }
                }}
                placeholder="Add a step"
                className="h-12"
                maxLength={200}
              />
              <Button type="button" variant="outline" className="h-12 w-12 shrink-0 px-0" aria-label="Add step" disabled={!newItem.trim()} onClick={() => { setChecklist([...checklist, { text: newItem.trim(), done: false }]); setNewItem(""); }}>
                <Plus className="size-5" />
              </Button>
            </div>
          </div>

          {/* Subtasks — only on an existing top-level task */}
          {task && !task.parentTaskId && (
            <div className="space-y-2">
              <Label className="text-sm">Subtasks</Label>
              {subtasks.map((st) => (
                <div key={st.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={st.status === "done" ? "Mark not done" : "Mark done"}
                    onClick={() => patch.mutate({ id: st.id, status: st.status === "done" ? "todo" : "done" })}
                    className="flex size-11 shrink-0 items-center justify-center"
                  >
                    <span className={cn("flex size-6 items-center justify-center rounded-full border-2", st.status === "done" ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40")}>{st.status === "done" && <Check className="size-4" strokeWidth={3} />}</span>
                  </button>
                  <span className={cn("min-w-0 flex-1 truncate text-base", st.status === "done" && "text-muted-foreground line-through")}>{st.title}</span>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                  placeholder="Add a subtask"
                  className="h-12"
                  maxLength={200}
                />
                <Button type="button" variant="outline" className="h-12 w-12 shrink-0 px-0" aria-label="Add subtask" disabled={!newSub.trim() || busy} onClick={addSubtask}>
                  <Plus className="size-5" />
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm">Details</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Anything else to remember" className="text-base" maxLength={2000} />
          </div>

          {projects.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">Project</Label>
              <Select value={projectId} onValueChange={(v) => v && setProjectId(v)}>
                <SelectTrigger className="h-12 w-full">
                  <SelectValue>{(v: unknown) => (v === NONE ? "No project" : projects.find((p) => p.id === v)?.name ?? "Choose")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm">Group (optional)</Label>
            <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Diwali campaign" className="h-12" maxLength={60} />
          </div>

          <div className="flex gap-2 pt-1">
            {task && (
              <Button
                type="button"
                variant="outline"
                className={cn("h-12 shrink-0 px-4", confirmDelete && "border-red-500 text-red-600")}
                disabled={busy}
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  del.mutate(task.id, { onSuccess: () => { toast.success("Task deleted"); onOpenChange(false); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't delete") });
                }}
              >
                <Trash2 className="size-4" />
                {confirmDelete ? "Tap again to delete" : ""}
              </Button>
            )}
            <Button type="submit" className="h-12 flex-1 text-base" disabled={busy || !title.trim()}>
              {busy ? "Saving…" : task ? "Save" : "Add task"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
