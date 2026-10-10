"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ListChecks, ListTodo, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldGroup, FormCard, FormShell, SectionHeading, pillClass } from "@/components/targets/form-ui";
import { REMINDER_LABELS } from "@/components/targets/work-ui";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type ChecklistItem } from "@/lib/work-tasks";
import { useCreateTask, useProject, useProjects, type TargetsMeta } from "@/hooks/use-targets";
import { cn } from "@/lib/utils";

const NONE = "none";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Pick({ value, onChange, options, none }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; none?: string }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="h-10 w-full">
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

export interface NewTaskDefaults {
  title?: string;
  projectId?: string | null;
  taskListId?: string | null;
  linkType?: string | null;
  linkId?: string | null;
  linkLabel?: string | null;
}

/** New task as a full page (the same look as the app's other New screens). Editing an existing task still uses the task panel. */
export function TaskForm({ meta, defaults, backHref }: { meta: TargetsMeta | undefined; defaults?: NewTaskDefaults; backHref: string }) {
  const router = useRouter();
  const create = useCreateTask();
  const projects = useProjects().data ?? [];
  const today = meta?.today ?? new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState(defaults?.title ?? "");
  const [titleError, setTitleError] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState(meta?.me.employeeId ?? NONE);
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("medium");
  const [duration, setDuration] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagText, setTagText] = useState("");
  const [reminder, setReminder] = useState("none");
  const [projectId, setProjectId] = useState(defaults?.projectId ?? NONE);
  const [listId, setListId] = useState(defaults?.taskListId ?? NONE);
  const [phaseId, setPhaseId] = useState(NONE);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");

  const canAssign = !!meta?.can.assignTasks;
  const staff = (meta?.staff ?? []).filter((s) => s.active);
  const projectDetail = useProject(projectId !== NONE ? projectId : "");
  const lists = projectDetail.data?.lists ?? [];
  const phases = projectDetail.data?.phases ?? [];
  const linkType = defaults?.linkType ?? null;
  const linkId = defaults?.linkId ?? null;

  function addTag() {
    const t = tagText.trim().replace(/,$/, "");
    if (t && !tags.includes(t) && tags.length < 10) setTags([...tags, t]);
    setTagText("");
  }

  function save() {
    if (!title.trim()) {
      setTitleError("Give the task a name");
      return;
    }
    // A step typed into the checklist box but not yet added with "+" is kept, not lost.
    const pendingStep = newItem.trim();
    create.mutate(
      {
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
        tags,
        reminder,
        checklist: [...checklist, ...(pendingStep ? [{ text: pendingStep, done: false }] : [])].filter((c) => c.text.trim()),
        linkType,
        linkId,
      },
      {
        onSuccess: () => {
          toast.success("Task added");
          router.push(backHref);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the task"),
      }
    );
  }

  return (
    <FormShell backHref={backHref} backLabel="Back" title="New Task" submitLabel="Add Task" busy={create.isPending} onSubmit={save}>
      <FormCard>
        <SectionHeading icon={ListTodo} label="Task details" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldGroup label="Task name" required error={titleError} className="sm:col-span-2">
            <Input
              autoFocus
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleError("");
              }}
              placeholder="What needs doing?"
              className="h-10"
              maxLength={200}
            />
            {linkType === "lead" && linkId && (
              <p className="text-xs text-muted-foreground">
                Follow-up for{" "}
                <Link href={`/targets/leads/${linkId}`} className="font-semibold text-primary">
                  {defaults?.linkLabel || "this lead"}
                </Link>
              </p>
            )}
          </FieldGroup>
          <FieldGroup label="Owner">
            {canAssign ? <Pick value={assignee} onChange={setAssignee} none="Nobody yet" options={staff.map((s) => ({ value: s.id, label: s.name }))} /> : <p className="flex h-10 items-center text-sm">You</p>}
          </FieldGroup>
          <FieldGroup label="Priority">
            <Pick value={priority} onChange={setPriority} options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABELS[p] }))} />
          </FieldGroup>
          <FieldGroup label="Start date">
            <DatePicker value={start} onChange={setStart} placeholder="Pick a date" className="w-full" />
          </FieldGroup>
          <FieldGroup label="Due date">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" className={pillClass(due === today)} onClick={() => setDue(today)}>
                  Today
                </button>
                <button type="button" className={pillClass(due === addDays(today, 1))} onClick={() => setDue(addDays(today, 1))}>
                  Tomorrow
                </button>
                <button type="button" className={pillClass(due === addDays(today, 7))} onClick={() => setDue(addDays(today, 7))}>
                  Next week
                </button>
                <button type="button" className={pillClass(!due)} onClick={() => setDue("")}>
                  No date
                </button>
              </div>
              <DatePicker value={due} onChange={setDue} placeholder="Or pick a date" className="w-full" />
            </div>
          </FieldGroup>
          <FieldGroup label="Duration (hours)">
            <Input type="number" inputMode="decimal" min={0} step="0.5" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 4" className="h-10" />
          </FieldGroup>
          <FieldGroup label="Reminder">
            <Pick value={reminder} onChange={setReminder} options={Object.entries(REMINDER_LABELS).map(([value, label]) => ({ value, label }))} />
          </FieldGroup>
          {projects.length > 0 && (
            <FieldGroup label="Project">
              <Pick
                value={projectId}
                onChange={(v) => {
                  setProjectId(v);
                  setListId(NONE);
                  setPhaseId(NONE);
                }}
                none="No project"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </FieldGroup>
          )}
          {projectId !== NONE && lists.length > 0 && (
            <FieldGroup label="Task list">
              <Pick value={listId} onChange={setListId} none="General" options={lists.map((l) => ({ value: l.id, label: l.name }))} />
            </FieldGroup>
          )}
          {projectId !== NONE && phases.length > 0 && (
            <FieldGroup label="Phase">
              <Pick value={phaseId} onChange={setPhaseId} none="No phase" options={phases.map((p) => ({ value: p.id, label: p.name }))} />
            </FieldGroup>
          )}
          <FieldGroup label="Tags" className="sm:col-span-2">
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
                className="h-10"
                maxLength={30}
              />
            </div>
          </FieldGroup>
        </div>
      </FormCard>

      <FormCard>
        <SectionHeading icon={ListChecks} label="Description and checklist" />
        <div className="space-y-4">
          <FieldGroup label="Description">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything else to remember" className="resize-none" maxLength={2000} />
          </FieldGroup>
          <FieldGroup label="Checklist">
            <div className="space-y-2">
              {checklist.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button type="button" aria-label="Toggle item" onClick={() => setChecklist(checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} className="flex size-10 shrink-0 items-center justify-center">
                    <span className={cn("flex size-5 items-center justify-center rounded border-2", c.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40")}>{c.done && <Check className="size-3.5" strokeWidth={3} />}</span>
                  </button>
                  <span className={cn("min-w-0 flex-1 truncate text-sm", c.done && "text-muted-foreground line-through")}>{c.text}</span>
                  <button type="button" aria-label="Remove item" onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} className="flex size-10 shrink-0 items-center justify-center text-muted-foreground">
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
                  className="h-10"
                  maxLength={200}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-10 shrink-0 px-0"
                  aria-label="Add step"
                  disabled={!newItem.trim()}
                  onClick={() => {
                    setChecklist([...checklist, { text: newItem.trim(), done: false }]);
                    setNewItem("");
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          </FieldGroup>
        </div>
      </FormCard>
    </FormShell>
  );
}
