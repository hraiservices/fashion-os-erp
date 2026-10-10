"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_STATUSES, type ChecklistItem } from "@/lib/work-tasks";
import type { ProjectWithProgress, TaskDto } from "@/lib/targets-types";
import { useAddComment, useAddDocument, useAddTimeLog, useCreateTask, useDeleteDocument, useDeleteTask, useDeleteTimeLog, useDocuments, usePatchTask, useProject, useTask, useTaskEvents, useTasks, useTimeLogs, type TargetsMeta, type TaskInput } from "@/hooks/use-targets";
import { cn } from "@/lib/utils";
import { fmtDateShort } from "@/lib/format";
import { REMINDER_LABELS, STATUS_CELL, taskCode } from "@/components/targets/work-ui";

const NONE = "none";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-b py-3 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function PickerSelect({ value, onChange, options, none }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; none?: string }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="h-11 w-full">
        <SelectValue>{(v: unknown) => (v === NONE ? none ?? "None" : options.find((o) => o.value === v)?.label ?? "Choose")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {none !== undefined && <SelectItem value={NONE}>{none}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Task panel: a slide-in panel on desktop, full-screen on a phone. Create or edit a task with
 * every field (owner, dates, duration, priority, completion %, tags, reminder, project, task list,
 * phase), plus — once the task exists — Comments, Subtasks, Documents, Dependency, Time and
 * Activity tabs. Staff without "assign tasks" always own their tasks. `defaults` pre-fills a new
 * task (a lead follow-up, a task inside a project or task list…).
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
  const [due, setDue] = useState("");
  const [start, setStart] = useState("");
  const [assignee, setAssignee] = useState(NONE);
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [projectId, setProjectId] = useState(NONE);
  const [listId, setListId] = useState(NONE);
  const [phaseId, setPhaseId] = useState(NONE);
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [completion, setCompletion] = useState("0");
  const [tags, setTags] = useState<string[]>([]);
  const [tagText, setTagText] = useState("");
  const [reminder, setReminder] = useState("none");
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newSub, setNewSub] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canAssign = !!meta?.can.assignTasks;
  const staff = (meta?.staff ?? []).filter((s) => s.active);
  const busy = create.isPending || patch.isPending || del.isPending;
  const projectDetail = useProject(open && projectId !== NONE ? projectId : "");
  const lists = projectDetail.data?.lists ?? [];
  const phases = projectDetail.data?.phases ?? [];

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the panel opens
    setConfirmDelete(false);
    setNewItem("");
    setNewSub("");
    setTagText("");
    setTitle(task?.title ?? defaults?.title ?? "");
    setDue(task ? task.dueDate ?? "" : defaults?.dueDate ?? "");
    setStart(task ? task.startDate ?? "" : defaults?.startDate ?? "");
    setAssignee(task ? task.assigneeId ?? NONE : defaults?.assigneeId ?? meta?.me.employeeId ?? NONE);
    setPriority(task?.priority ?? defaults?.priority ?? "medium");
    setStatus(task?.status ?? "todo");
    setProjectId(task ? task.projectId ?? NONE : defaults?.projectId ?? NONE);
    setListId(task ? task.taskListId ?? NONE : defaults?.taskListId ?? NONE);
    setPhaseId(task ? task.phaseId ?? NONE : defaults?.phaseId ?? NONE);
    setDescription(task?.description ?? "");
    setDuration(task?.durationHours != null ? String(task.durationHours) : "");
    setCompletion(String(task?.completionPct ?? 0));
    setTags(task?.tags ?? []);
    setReminder(task?.reminder ?? "none");
    setDependsOn(task?.dependsOn ?? []);
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
      taskListId: projectId === NONE || listId === NONE ? null : listId,
      phaseId: projectId === NONE || phaseId === NONE ? null : phaseId,
      assigneeId: assignee === NONE ? null : assignee,
      priority,
      startDate: start || null,
      dueDate: due || null,
      durationHours: duration.trim() ? parseFloat(duration) || null : null,
      completionPct: Math.min(100, Math.max(0, parseInt(completion, 10) || 0)),
      tags,
      reminder,
      dependsOn,
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

  function addTag() {
    const t = tagText.trim().replace(/,$/, "");
    if (t && !tags.includes(t) && tags.length < 10) setTags([...tags, t]);
    setTagText("");
  }

  function addSubtask() {
    if (!task || !newSub.trim()) return;
    create.mutate(
      { title: newSub.trim(), parentTaskId: task.id, projectId: task.projectId, assigneeId: task.assigneeId, dueDate: task.dueDate },
      { onSuccess: () => setNewSub(""), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add the subtask") }
    );
  }

  const chip = (active: boolean) => cn("min-h-10 rounded-full border px-3.5 text-sm font-medium", active ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl gap-0 overflow-y-auto p-0">
        <div className="sticky top-0 z-10 space-y-1 border-b bg-popover px-4 py-3 pr-12">
          <SheetTitle className="sr-only">{task ? "Task" : "New task"}</SheetTitle>
          <Input autoFocus={!task} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" className="h-12 border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0" maxLength={200} />
          <p className="text-xs text-muted-foreground">
            {task ? `${taskCode(task.taskNo)}${task.taskNo != null ? " · " : ""}By ${task.createdBy ?? "—"}` : "New task"}
            {linkType === "lead" && linkId && (
              <>
                {" · Follow-up for "}
                <Link href={`/targets/leads/${linkId}`} className="font-semibold text-primary" onClick={() => onOpenChange(false)}>
                  {linkLabel || "this lead"}
                </Link>
              </>
            )}
          </p>
        </div>

        <form
          className="flex-1 space-y-4 px-4 pb-4 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {task && (
            <div className="flex flex-wrap gap-2">
              {TASK_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} className={cn("min-h-10 rounded px-3 text-xs font-semibold transition-opacity", STATUS_CELL[s], status === s ? "ring-2 ring-foreground/40 ring-offset-1" : "opacity-45")}>
                  {TASK_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          )}

          <section className="rounded-xl border bg-card px-4">
            <Row label="Owner">
              {canAssign ? <PickerSelect value={assignee} onChange={setAssignee} none="Nobody yet" options={staff.map((s) => ({ value: s.id, label: s.name }))} /> : <span className="text-sm">You</span>}
            </Row>
            <Row label="Start date">
              <DatePicker value={start} onChange={setStart} placeholder="Pick a date" className="h-11 w-full" />
            </Row>
            <Row label="Due date">
              <div className="space-y-2">
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
                <DatePicker value={due} onChange={setDue} placeholder="Or pick a date" className="h-11 w-full" />
              </div>
            </Row>
            <Row label="Duration (hours)">
              <Input type="number" inputMode="decimal" min={0} step="0.5" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 4" className="h-11" />
            </Row>
            <Row label="Priority">
              <PickerSelect value={priority} onChange={setPriority} options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABELS[p] }))} />
            </Row>
            <Row label="Completion %">
              <Input type="number" inputMode="numeric" min={0} max={100} value={completion} onChange={(e) => setCompletion(e.target.value)} className="h-11" />
            </Row>
            <Row label="Tags">
              <div className="space-y-2">
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-1 pl-2.5 pr-1 text-xs">
                        {t}
                        <button type="button" aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))} className="flex size-6 items-center justify-center">
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                  onBlur={addTag}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Type a tag, press Enter"
                  className="h-11"
                  maxLength={30}
                />
              </div>
            </Row>
            <Row label="Reminder">
              <PickerSelect value={reminder} onChange={setReminder} options={Object.entries(REMINDER_LABELS).map(([value, label]) => ({ value, label }))} />
            </Row>
            {projects.length > 0 && (
              <Row label="Project">
                <PickerSelect
                  value={projectId}
                  onChange={(v) => {
                    setProjectId(v);
                    setListId(NONE);
                    setPhaseId(NONE);
                  }}
                  none="No project"
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Row>
            )}
            {projectId !== NONE && lists.length > 0 && (
              <Row label="Task list">
                <PickerSelect value={listId} onChange={setListId} none="General" options={lists.map((l) => ({ value: l.id, label: l.name }))} />
              </Row>
            )}
            {projectId !== NONE && phases.length > 0 && (
              <Row label="Phase">
                <PickerSelect value={phaseId} onChange={setPhaseId} none="No phase" options={phases.map((p) => ({ value: p.id, label: p.name }))} />
              </Row>
            )}
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Description</h3>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Anything else to remember" className="text-base" maxLength={2000} />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Checklist</h3>
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
                className="h-11"
                maxLength={200}
              />
              <Button type="button" variant="outline" className="h-11 w-11 shrink-0 px-0" aria-label="Add step" disabled={!newItem.trim()} onClick={() => { setChecklist([...checklist, { text: newItem.trim(), done: false }]); setNewItem(""); }}>
                <Plus className="size-5" />
              </Button>
            </div>
          </section>

          {task && (
            <TaskTabs
              task={task}
              subtasks={subtasks}
              today={today}
              newSub={newSub}
              setNewSub={setNewSub}
              addSubtask={addSubtask}
              busy={busy}
              dependsOn={dependsOn}
              setDependsOn={setDependsOn}
              meta={meta}
              onToggleSub={(st) => patch.mutate({ id: st.id, status: st.status === "done" ? "todo" : "done" })}
            />
          )}

          <div className="sticky bottom-0 -mx-4 flex gap-2 border-t bg-popover px-4 py-3">
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

function TaskTabs({
  task,
  subtasks,
  today,
  newSub,
  setNewSub,
  addSubtask,
  busy,
  dependsOn,
  setDependsOn,
  meta,
  onToggleSub,
}: {
  task: TaskDto;
  subtasks: TaskDto[];
  today: string;
  newSub: string;
  setNewSub: (v: string) => void;
  addSubtask: () => void;
  busy: boolean;
  dependsOn: string[];
  setDependsOn: (v: string[]) => void;
  meta: TargetsMeta | undefined;
  onToggleSub: (t: TaskDto) => void;
}) {
  const events = useTaskEvents(task.id).data ?? [];
  const addComment = useAddComment();
  const docs = useDocuments({ taskId: task.id }).data ?? [];
  const addDoc = useAddDocument();
  const delDoc = useDeleteDocument();
  const logs = useTimeLogs({ task: task.id }).data ?? [];
  const addLog = useAddTimeLog();
  const delLog = useDeleteTimeLog();
  const siblings = useTasks({ status: "all", project: task.projectId ?? undefined }).data ?? [];
  const [comment, setComment] = useState("");
  const [docName, setDocName] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [logDate, setLogDate] = useState(today);
  const [logHours, setLogHours] = useState("");
  const [logNote, setLogNote] = useState("");
  const nameOf = (id: string | null) => meta?.staff.find((s) => s.id === id)?.name ?? "—";
  const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const candidates = siblings.filter((t) => t.id !== task.id && !t.parentTaskId && !dependsOn.includes(t.id));
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

  return (
    <Tabs defaultValue="comments" className="pt-2">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="comments">Comments</TabsTrigger>
        <TabsTrigger value="subtasks">Subtasks{subtasks.length ? ` (${subtasks.length})` : ""}</TabsTrigger>
        <TabsTrigger value="docs">Documents{docs.length ? ` (${docs.length})` : ""}</TabsTrigger>
        <TabsTrigger value="deps">Dependency</TabsTrigger>
        <TabsTrigger value="time">Time</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>

      <TabsContent value="comments" className="space-y-3 pt-3">
        <div className="space-y-2">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Write a comment" maxLength={2000} className="text-base" />
          <Button type="button" className="h-11" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate({ taskId: task.id, body: comment.trim() }, { onSuccess: () => setComment(""), onError: err })}>
            Add comment
          </Button>
        </div>
        <ul className="space-y-2">
          {events.filter((e) => e.kind === "comment").map((e) => (
            <li key={e.id} className="rounded-lg border bg-card px-3 py-2">
              <p className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-semibold">{e.createdBy ?? "—"}</span>
                <span>{when(e.createdAt)}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{e.body}</p>
            </li>
          ))}
          {events.every((e) => e.kind !== "comment") && <li className="text-sm text-muted-foreground">No comments yet.</li>}
        </ul>
      </TabsContent>

      <TabsContent value="subtasks" className="space-y-2 pt-3">
        {subtasks.map((st) => (
          <div key={st.id} className="flex items-center gap-2">
            <button type="button" aria-label={st.status === "done" ? "Mark not done" : "Mark done"} onClick={() => onToggleSub(st)} className="flex size-11 shrink-0 items-center justify-center">
              <span className={cn("flex size-6 items-center justify-center rounded-full border-2", st.status === "done" ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40")}>{st.status === "done" && <Check className="size-4" strokeWidth={3} />}</span>
            </button>
            <span className={cn("min-w-0 flex-1 truncate text-base", st.status === "done" && "text-muted-foreground line-through")}>{st.title}</span>
          </div>
        ))}
        {!task.parentTaskId ? (
          <div className="flex gap-2">
            <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }} placeholder="Add a subtask" className="h-11" maxLength={200} />
            <Button type="button" variant="outline" className="h-11 w-11 shrink-0 px-0" aria-label="Add subtask" disabled={!newSub.trim() || busy} onClick={addSubtask}>
              <Plus className="size-5" />
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">A subtask can&apos;t have its own subtasks.</p>
        )}
      </TabsContent>

      <TabsContent value="docs" className="space-y-3 pt-3">
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Name (e.g. Design sketch)" className="h-11" maxLength={120} />
          <Input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Paste a link (https://…)" className="h-11" inputMode="url" maxLength={1000} />
          <Button type="button" className="h-11" disabled={!docName.trim() || !docUrl.trim() || addDoc.isPending} onClick={() => addDoc.mutate({ taskId: task.id, name: docName.trim(), url: docUrl.trim() }, { onSuccess: () => { setDocName(""); setDocUrl(""); }, onError: err })}>
            Add link
          </Button>
        </div>
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3">
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-medium text-primary">
                <ExternalLink className="size-3.5 shrink-0" />
                <span className="truncate">{d.name}</span>
              </a>
              <button type="button" aria-label="Remove link" onClick={() => delDoc.mutate(d.id, { onError: err })} className="flex size-9 items-center justify-center text-muted-foreground">
                <X className="size-4" />
              </button>
            </li>
          ))}
          {docs.length === 0 && <li className="text-sm text-muted-foreground">No documents yet.</li>}
        </ul>
      </TabsContent>

      <TabsContent value="deps" className="space-y-3 pt-3">
        <p className="text-xs text-muted-foreground">This task waits for the tasks below. Save the task after changing them.</p>
        {dependsOn.map((id) => {
          const t = siblings.find((x) => x.id === id);
          return (
            <div key={id} className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3">
              <span className="min-w-0 flex-1 truncate text-sm">{t?.title ?? "Another task"}</span>
              {t && <span className={cn("shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold", STATUS_CELL[t.status])}>{TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS]}</span>}
              <button type="button" aria-label="Remove dependency" onClick={() => setDependsOn(dependsOn.filter((x) => x !== id))} className="flex size-9 items-center justify-center text-muted-foreground">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
        {candidates.length > 0 ? (
          <PickerSelect value={NONE} onChange={(v) => v !== NONE && setDependsOn([...dependsOn, v])} none="Add a task it depends on…" options={candidates.slice(0, 100).map((t) => ({ value: t.id, label: t.title }))} />
        ) : (
          <p className="text-sm text-muted-foreground">{task.projectId ? "No other tasks in this project." : "Put this task in a project to link it with other tasks."}</p>
        )}
      </TabsContent>

      <TabsContent value="time" className="space-y-3 pt-3">
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <DatePicker value={logDate} onChange={setLogDate} className="h-11 w-full" />
            <Input type="number" inputMode="decimal" min={0} step="0.25" value={logHours} onChange={(e) => setLogHours(e.target.value)} placeholder="Hours" className="h-11" />
          </div>
          <Input value={logNote} onChange={(e) => setLogNote(e.target.value)} placeholder="What did you do? (optional)" className="h-11" maxLength={300} />
          <Button type="button" className="h-11" disabled={!(parseFloat(logHours) > 0) || addLog.isPending} onClick={() => addLog.mutate({ taskId: task.id, logDate, hours: parseFloat(logHours), note: logNote.trim() }, { onSuccess: () => { setLogHours(""); setLogNote(""); }, onError: err })}>
            Log time
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Total: {logs.reduce((s, l) => s + l.hours, 0)} h{task.durationHours ? ` of ${task.durationHours} h planned` : ""}</p>
        <ul className="space-y-1.5">
          {logs.map((l) => (
            <li key={l.id} className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{l.hours} h</span> · {fmtDateShort(l.logDate)} · {nameOf(l.employeeId)}
                {l.note && <span className="text-muted-foreground"> — {l.note}</span>}
              </span>
              <button type="button" aria-label="Remove time log" onClick={() => delLog.mutate(l.id, { onError: err })} className="flex size-9 items-center justify-center text-muted-foreground">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </TabsContent>

      <TabsContent value="activity" className="pt-3">
        <ul className="space-y-2">
          {events.filter((e) => e.kind !== "comment").map((e) => (
            <li key={e.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
              <p className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{e.createdBy ?? "—"}</span>
                <span>{when(e.createdAt)}</span>
              </p>
              <p className="mt-0.5">{e.body}</p>
            </li>
          ))}
          {events.every((e) => e.kind === "comment") && <li className="text-sm text-muted-foreground">No activity yet.</li>}
        </ul>
      </TabsContent>
    </Tabs>
  );
}
