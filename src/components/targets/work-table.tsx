"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fmtDateShort } from "@/lib/format";
import type { TaskDto, TaskListDto } from "@/lib/targets-types";
import { subtaskProgress } from "@/lib/work-tasks";
import { CompletionBar, DueText, PriorityMark, StatusCell, TagChips, taskCode } from "@/components/targets/work-ui";
import { cn } from "@/lib/utils";

export interface TableGroup {
  key: string;
  title: string;
  tasks: TaskDto[];
  /** Where a task typed into this group's "Add Task" row goes. */
  defaults: { projectId?: string | null; taskListId?: string | null };
}

/** Build the table's groups: by task list inside one project, or by project across projects. */
export function groupTasks(tasks: TaskDto[], opts: { by: "list"; lists: TaskListDto[]; projectId: string } | { by: "project"; projectName: (id: string | null) => string }): TableGroup[] {
  const top = tasks.filter((t) => !t.parentTaskId);
  if (opts.by === "list") {
    const groups: TableGroup[] = [{ key: "general", title: "General", tasks: top.filter((t) => !t.taskListId || !opts.lists.some((l) => l.id === t.taskListId)), defaults: { projectId: opts.projectId, taskListId: null } }];
    for (const l of opts.lists) groups.push({ key: l.id, title: l.name, tasks: top.filter((t) => t.taskListId === l.id), defaults: { projectId: opts.projectId, taskListId: l.id } });
    return groups;
  }
  const byProject = new Map<string | null, TaskDto[]>();
  for (const t of top) byProject.set(t.projectId, [...(byProject.get(t.projectId) || []), t]);
  const keys = Array.from(byProject.keys()).sort((a, b) => (a === null ? 1 : b === null ? -1 : opts.projectName(a).localeCompare(opts.projectName(b))));
  return keys.map((k) => ({ key: k ?? "none", title: k ? opts.projectName(k) : "No project", tasks: byProject.get(k)!, defaults: { projectId: k, taskListId: null } }));
}

/**
 * Desktop task table in the Zoho Projects style: collapsible groups, a solid status cell, red
 * overdue dates with "(N days ago)", completion bars, and an "Add Task" row under every group.
 */
export function WorkTable({
  groups,
  allTasks,
  today,
  nameOf,
  showProject,
  projectName,
  onOpen,
  onToggle,
  onQuickAdd,
  extraFooter,
}: {
  groups: TableGroup[];
  allTasks: TaskDto[];
  today: string;
  nameOf: (id: string | null | undefined) => string;
  showProject?: boolean;
  projectName: (id: string | null) => string;
  onOpen: (t: TaskDto) => void;
  onToggle: (t: TaskDto) => void;
  onQuickAdd?: (title: string, defaults: TableGroup["defaults"]) => void;
  extraFooter?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<Record<string, string>>({});
  const cols = useMemo(() => 9 + (showProject ? 1 : 0), [showProject]);
  const th = "whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-muted-foreground";

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <thead className="border-b bg-muted/30">
          <tr>
            <th className="w-10 px-3" />
            <th className={cn(th, "w-20")}>ID</th>
            <th className={cn(th, "min-w-56")}>Task name</th>
            {showProject && <th className={th}>Project</th>}
            <th className={th}>Owner</th>
            <th className={th}>Status</th>
            <th className={th}>Tags</th>
            <th className={th}>Start date</th>
            <th className={th}>Due date</th>
            <th className={th}>Priority</th>
            <th className={th}>Completion</th>
          </tr>
        </thead>
        {groups.map((g) => {
          const open = !collapsed[g.key];
          return (
            <tbody key={g.key} className="border-b last:border-b-0">
              <tr className="bg-muted/40">
                <td colSpan={cols + 1} className="px-3 py-2">
                  <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [g.key]: open }))} className="flex min-h-8 items-center gap-1.5 text-sm font-semibold">
                    {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    {g.title} <span className="font-normal text-muted-foreground">({g.tasks.length})</span>
                  </button>
                </td>
              </tr>
              {open &&
                g.tasks.map((t) => {
                  const done = t.status === "done";
                  const sp = subtaskProgress(t.id, allTasks);
                  return (
                    <tr key={t.id} className="border-t hover:bg-muted/30">
                      <td className="px-3">
                        <button type="button" aria-label={done ? "Mark not done" : "Mark done"} onClick={() => onToggle(t)} className="flex size-8 items-center justify-center">
                          <span className={cn("flex size-4 items-center justify-center rounded border", done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/50")}>{done && <span className="text-[10px] leading-none">✓</span>}</span>
                        </button>
                      </td>
                      <td className="px-3 text-xs text-muted-foreground">{taskCode(t.taskNo)}</td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => onOpen(t)} className={cn("block max-w-md truncate text-left font-medium hover:text-primary", done && "text-muted-foreground line-through")}>
                          {t.title}
                          {sp.total > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{sp.done}/{sp.total}</span>}
                        </button>
                      </td>
                      {showProject && <td className="px-3 text-muted-foreground">{t.projectId ? projectName(t.projectId) : "–"}</td>}
                      <td className="px-3 whitespace-nowrap">{t.assigneeId ? nameOf(t.assigneeId) : <span className="text-muted-foreground">–</span>}</td>
                      <td className="px-3">
                        <StatusCell status={t.status} />
                      </td>
                      <td className="px-3">
                        <TagChips tags={t.tags} />
                      </td>
                      <td className="whitespace-nowrap px-3 text-muted-foreground">{t.startDate ? fmtDateShort(t.startDate) : "–"}</td>
                      <td className="px-3">
                        <DueText due={t.dueDate} status={t.status} today={today} />
                      </td>
                      <td className="px-3">
                        <PriorityMark priority={t.priority} />
                      </td>
                      <td className="px-3">
                        <CompletionBar pct={t.completionPct} />
                      </td>
                    </tr>
                  );
                })}
              {open && onQuickAdd && (
                <tr className="border-t">
                  <td />
                  <td colSpan={cols} className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <Plus className="size-4 text-muted-foreground" />
                      <Input
                        value={adding[g.key] ?? ""}
                        onChange={(e) => setAdding((a) => ({ ...a, [g.key]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (adding[g.key] ?? "").trim()) {
                            onQuickAdd(adding[g.key].trim(), g.defaults);
                            setAdding((a) => ({ ...a, [g.key]: "" }));
                          }
                        }}
                        placeholder="Add Task — type a name and press Enter"
                        className="h-9 max-w-md border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                        maxLength={200}
                      />
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
        {extraFooter && (
          <tbody>
            <tr>
              <td colSpan={cols + 1} className="px-3 py-2">
                {extraFooter}
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}
