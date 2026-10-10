"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateShort } from "@/lib/format";
import { isFinished, isOverdue, TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/work-tasks";
import type { PhaseDto, ProjectWithProgress, TaskDto } from "@/lib/targets-types";
import { useAddDocument, useAddTimeLog, useCreatePhase, useDeleteDocument, useDeletePhase, useDeleteTimeLog, useDocuments, usePatchPhase, useProjectFeed, useSetProjectMembers, useTimeLogs, type TargetsMeta } from "@/hooks/use-targets";

import { fmtHours } from "@/components/targets/work-ui";
import { cn } from "@/lib/utils";

type Nameof = (id: string | null | undefined) => string;
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 rounded-xl border bg-card p-4", className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────

const STATUS_HEX: Record<string, string> = { todo: "#10b981", in_progress: "#0ea5e9", blocked: "#ef4444", done: "#64748b", cancelled: "#a1a1aa" };

export function ProjectDashboard({ project, tasks, phases, memberIds, today, nameOf }: { project: ProjectWithProgress; tasks: TaskDto[]; phases: PhaseDto[]; memberIds: string[]; today: string; nameOf: Nameof }) {
  const top = tasks.filter((t) => !t.parentTaskId);
  const counts = TASK_STATUSES.map((s) => ({ s, n: top.filter((t) => t.status === s).length }));
  const total = top.length;
  let acc = 0;
  const gradient = total
    ? counts
        .filter((c) => c.n > 0)
        .map((c) => {
          const from = (acc / total) * 100;
          acc += c.n;
          return `${STATUS_HEX[c.s]} ${from}% ${(acc / total) * 100}%`;
        })
        .join(", ")
    : "";
  const overdue = top.filter((t) => isOverdue(t, today)).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const people = Array.from(new Set([project.ownerId, ...memberIds, ...top.map((t) => t.assigneeId)].filter((x): x is string => !!x)));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Task status">
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative size-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }} aria-label="Tasks by status">
              <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-card">
                <span className="text-2xl font-bold">{project.progress.pct}%</span>
                <span className="text-[11px] text-muted-foreground">done</span>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm">
              {counts.map((c) => (
                <li key={c.s} className="flex items-center gap-2">
                  <span className="size-3 rounded-sm" style={{ background: STATUS_HEX[c.s] }} />
                  <span className="w-24">{TASK_STATUS_LABELS[c.s]}</span>
                  <span className="tabular-nums font-medium">{c.n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title={`Overdue work items${overdue.length ? ` · ${overdue.length}` : ""}`}>
        {overdue.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Good job! Nothing is overdue.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {overdue.slice(0, 8).map((t) => (
              <li key={t.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{nameOf(t.assigneeId)}</span>
                <span className="shrink-0 text-xs font-semibold text-red-600">{fmtDateShort(t.dueDate as string)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Team status">
        {people.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No one is on this project yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1.5 font-medium">Person</th>
                  <th className="px-2 text-right font-medium text-red-600">Overdue</th>
                  <th className="px-2 text-right font-medium">Today</th>
                  <th className="px-2 text-right font-medium">All open</th>
                </tr>
              </thead>
              <tbody>
                {people.map((id) => {
                  const mine = top.filter((t) => t.assigneeId === id && !isFinished(t.status));
                  return (
                    <tr key={id} className="border-t">
                      <td className="py-2">{nameOf(id)}</td>
                      <td className="px-2 text-right tabular-nums">{mine.filter((t) => isOverdue(t, today)).length}</td>
                      <td className="px-2 text-right tabular-nums">{mine.filter((t) => t.dueDate === today).length}</td>
                      <td className="px-2 text-right tabular-nums">{mine.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Phases">
        {phases.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No phases. Add them in the Phases tab.</p>
        ) : (
          <ul className="space-y-2">
            {phases.map((p) => {
              const pt = top.filter((t) => t.phaseId === p.id);
              const done = pt.filter((t) => t.status === "done").length;
              const pct = pt.length ? Math.round((done / pt.length) * 100) : p.status === "done" ? 100 : 0;
              return (
                <li key={p.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{pt.length ? `${done}/${pt.length} tasks` : p.status}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────

export function ProjectUsers({ project, memberIds, canManage, meta, nameOf }: { project: ProjectWithProgress; memberIds: string[]; canManage: boolean; meta: TargetsMeta | undefined; nameOf: Nameof }) {
  const save = useSetProjectMembers();
  const [picked, setPicked] = useState<string[]>(memberIds);
  // Follow the saved list when it really changes — not on every refetch, which hands back a new array of the same people
  // and would throw away a selection that hasn't been saved yet.
  const savedKey = memberIds.slice().sort().join();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the picker in step with the saved member list
  useEffect(() => setPicked(memberIds), [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const staff = (meta?.staff ?? []).filter((s) => s.active);
  const dirty = picked.slice().sort().join() !== memberIds.slice().sort().join();

  return (
    <Card title="Users on this project">
      <p className="text-sm text-muted-foreground">
        Owner: <span className="font-medium text-foreground">{nameOf(project.ownerId)}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {staff.map((s) => {
          const on = picked.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              disabled={!canManage}
              onClick={() => setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])}
              className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium disabled:opacity-100", on ? "border-primary bg-primary/10 text-primary" : "bg-card")}
            >
              {on && <Check className="size-4" />}
              {s.name}
            </button>
          );
        })}
        {staff.length === 0 && <p className="text-sm text-muted-foreground">Add staff in Employees first.</p>}
      </div>
      {canManage ? (
        <Button className="h-11" disabled={!dirty || save.isPending} onClick={() => save.mutate({ projectId: project.id, employeeIds: picked }, { onSuccess: () => toast.success("Users saved"), onError: err })}>
          Save users
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Only the project owner or a manager can change this.</p>
      )}
    </Card>
  );
}

// ── Phases ────────────────────────────────────────────────────────────────

const PHASE_STATUS = ["planned", "active", "done"] as const;

export function ProjectPhases({ project, phases, tasks, canManage }: { project: ProjectWithProgress; phases: PhaseDto[]; tasks: TaskDto[]; canManage: boolean }) {
  const create = useCreatePhase();
  const patch = usePatchPhase();
  const del = useDeletePhase();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  return (
    <div className="space-y-4">
      {canManage && (
        <Card title="Add a phase">
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Phase name (e.g. Design)" className="h-11" maxLength={80} />
            <DatePicker value={start} onChange={setStart} placeholder="Starts" className="h-11 w-full" />
            <DatePicker value={end} onChange={setEnd} placeholder="Ends" className="h-11 w-full" />
            <Button className="h-11" disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ projectId: project.id, name: name.trim(), startDate: start || null, endDate: end || null }, { onSuccess: () => { setName(""); setStart(""); setEnd(""); }, onError: err })}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
        </Card>
      )}
      {phases.length === 0 && <EmptyState title="No phases yet" description="Phases split a project into stages, like Design, Production and Delivery." />}
      <ul className="space-y-2">
        {phases.map((p) => {
          const pt = tasks.filter((t) => t.phaseId === p.id && !t.parentTaskId);
          return (
            <li key={p.id} className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.startDate ? fmtDateShort(p.startDate) : "?"} – {p.endDate ? fmtDateShort(p.endDate) : "?"} · {pt.length} task{pt.length === 1 ? "" : "s"}
                  </p>
                </div>
                {canManage && (
                  <button type="button" aria-label="Delete phase" className="flex size-10 shrink-0 items-center justify-center text-muted-foreground" onClick={() => del.mutate(p.id, { onError: err })}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {PHASE_STATUS.map((s) => (
                  <button key={s} type="button" disabled={!canManage} onClick={() => patch.mutate({ id: p.id, status: s }, { onError: err })} className={cn("min-h-10 rounded-full border px-4 text-sm font-medium capitalize disabled:opacity-100", p.status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
                    {s}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────

export function ProjectDocuments({ projectId }: { projectId: string }) {
  const docs = useDocuments({ projectId }).data ?? [];
  const add = useAddDocument();
  const del = useDeleteDocument();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  return (
    <div className="space-y-4">
      <Card title="Add a document link">
        <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-11" maxLength={120} />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link (https://…)" inputMode="url" className="h-11" maxLength={1000} />
          <Button className="h-11" disabled={!name.trim() || !url.trim() || add.isPending} onClick={() => add.mutate({ projectId, name: name.trim(), url: url.trim() }, { onSuccess: () => { setName(""); setUrl(""); }, onError: err })}>
            Add link
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Keep files in Google Drive, Dropbox or similar and paste the share link here.</p>
      </Card>
      {docs.length === 0 && <EmptyState title="No documents yet" />}
      <ul className="space-y-1.5">
        {docs.map((d) => (
          <li key={d.id} className="flex min-h-12 items-center gap-2 rounded-xl border bg-card px-4">
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-primary">
              <ExternalLink className="size-4 shrink-0" />
              <span className="truncate">{d.name}</span>
            </a>
            <span className="hidden text-xs text-muted-foreground sm:inline">{d.createdBy}</span>
            <button type="button" aria-label="Remove link" onClick={() => del.mutate(d.id, { onError: err })} className="flex size-9 items-center justify-center text-muted-foreground">
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Time logs ─────────────────────────────────────────────────────────────

export function ProjectTimeLogs({ project, tasks, meta, nameOf }: { project: ProjectWithProgress; tasks: TaskDto[]; meta: TargetsMeta | undefined; nameOf: Nameof }) {
  const logs = useTimeLogs({ project: project.id }).data ?? [];
  const add = useAddTimeLog();
  const del = useDeleteTimeLog();
  const [pickedDate, setDate] = useState("");
  const date = pickedDate || (meta?.today ?? ""); // today until another day is picked — the shop date may arrive after this opens
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [taskId, setTaskId] = useState("none");
  const top = tasks.filter((t) => !t.parentTaskId);
  const total = fmtHours(logs.reduce((s, l) => s + l.hours, 0));
  const taskName = (id: string | null) => tasks.find((t) => t.id === id)?.title ?? "—";

  return (
    <div className="space-y-4">
      <Card title="Log time">
        <div className="grid gap-2 sm:grid-cols-[10rem_7rem_1fr_1fr_auto] sm:items-end">
          <DatePicker value={date} onChange={setDate} className="h-11 w-full" />
          <Input type="number" inputMode="decimal" min={0} step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours" className="h-11" />
          <Select value={taskId} onValueChange={(v) => v && setTaskId(v)}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue>{(v: unknown) => (v === "none" ? "Whole project" : top.find((t) => t.id === v)?.title ?? "Task")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Whole project</SelectItem>
              {top.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-11" maxLength={300} />
          <Button className="h-11" disabled={!(parseFloat(hours) > 0) || !date || add.isPending} onClick={() => add.mutate({ projectId: project.id, taskId: taskId === "none" ? null : taskId, logDate: date, hours: parseFloat(hours), note: note.trim() }, { onSuccess: () => { setHours(""); setNote(""); }, onError: err })}>
            Log
          </Button>
        </div>
      </Card>
      <p className="px-1 text-sm text-muted-foreground">
        {logs.length} entries · <span className="font-semibold text-foreground">{total} h</span> total
      </p>
      {logs.length === 0 && <EmptyState title="No time logged yet" />}
      <ul className="space-y-1.5">
        {logs.map((l) => (
          <li key={l.id} className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-2 text-sm">
            <span className="w-14 shrink-0 font-semibold tabular-nums">{fmtHours(l.hours)} h</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{l.taskId ? taskName(l.taskId) : "Whole project"}{l.note && <span className="text-muted-foreground"> — {l.note}</span>}</span>
              <span className="block text-xs text-muted-foreground">
                {nameOf(l.employeeId)} · {fmtDateShort(l.logDate)}
              </span>
            </span>
            <button type="button" aria-label="Remove time log" onClick={() => del.mutate(l.id, { onError: err })} className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Timesheet (weekly hours per person) ───────────────────────────────────

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ProjectTimesheet({ projectId, meta, nameOf }: { projectId?: string; meta: TargetsMeta | undefined; nameOf: Nameof }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(meta?.today ?? new Date().toISOString().slice(0, 10)));
  const weekEnd = plusDays(weekStart, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => plusDays(weekStart, i)), [weekStart]);
  const logs = useTimeLogs({ from: weekStart, to: weekEnd, project: projectId }).data ?? [];
  const people = Array.from(new Set(logs.map((l) => l.employeeId ?? "none")));
  const hoursFor = (p: string, day: string) => logs.filter((l) => (l.employeeId ?? "none") === p && l.logDate === day).reduce((s, l) => s + l.hours, 0);
  const fmt = (n: number) => (n ? String(Math.round(n * 100) / 100) : "–");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" className="h-11 w-11 px-0" aria-label="Previous week" onClick={() => setWeekStart(plusDays(weekStart, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="text-sm font-semibold">
          {fmtDateShort(weekStart)} – {fmtDateShort(weekEnd)}
        </p>
        <Button variant="outline" className="h-11 w-11 px-0" aria-label="Next week" onClick={() => setWeekStart(plusDays(weekStart, 7))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
      {people.length === 0 ? (
        <EmptyState title="No time logged this week" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">Person</th>
                {days.map((d) => (
                  <th key={d} className="px-2 py-2.5 text-right font-medium">
                    {new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" })}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p} className="border-t">
                  <td className="px-3 py-2.5 font-medium">{p === "none" ? "—" : nameOf(p)}</td>
                  {days.map((d) => (
                    <td key={d} className="px-2 text-right tabular-nums">
                      {fmt(hoursFor(p, d))}
                    </td>
                  ))}
                  <td className="px-3 text-right font-semibold tabular-nums">{fmt(days.reduce((s, d) => s + hoursFor(p, d), 0))}</td>
                </tr>
              ))}
              <tr className="border-t-2 bg-muted/30 font-semibold">
                <td className="px-3 py-2.5">Total</td>
                {days.map((d) => (
                  <td key={d} className="px-2 text-right tabular-nums">
                    {fmt(people.reduce((s, p) => s + hoursFor(p, d), 0))}
                  </td>
                ))}
                <td className="px-3 text-right tabular-nums">{fmt(logs.reduce((s, l) => s + l.hours, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <Label className="sr-only">Hours per day</Label>
    </div>
  );
}

// ── Feed ──────────────────────────────────────────────────────────────────

export function ProjectFeed({ projectId }: { projectId: string }) {
  const q = useProjectFeed(projectId);
  const events = q.data ?? [];
  if (!q.isLoading && events.length === 0) return <EmptyState title="No activity yet" description="Comments and changes on this project's tasks show up here." />;
  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="rounded-xl border bg-card px-4 py-3 text-sm">
          <p className="flex justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-semibold">{e.createdBy ?? "—"}</span>
            <span>{when(e.createdAt)}</span>
          </p>
          {e.taskTitle && <p className="mt-0.5 text-xs text-muted-foreground">on {e.taskTitle}</p>}
          <p className="mt-0.5 whitespace-pre-wrap">{e.body}</p>
        </li>
      ))}
    </ul>
  );
}
