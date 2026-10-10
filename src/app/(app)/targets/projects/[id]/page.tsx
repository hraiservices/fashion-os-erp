"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtDateShort } from "@/lib/format";
import { PROJECT_STATUS_LABELS, subtaskProgress } from "@/lib/work-tasks";
import type { TaskDto } from "@/lib/targets-types";
import { usePatchTask, useProject, useProjects, useTargetsMeta } from "@/hooks/use-targets";
import { useStaffLookup } from "@/components/targets/shared";
import { TaskRow } from "@/components/targets/task-row";
import { TaskSheet } from "@/components/targets/task-sheet";
import { ProjectFormSheet } from "@/components/targets/project-form-sheet";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const meta = useTargetsMeta().data;
  const { nameOf } = useStaffLookup(meta);
  const { data, isLoading } = useProject(id);
  const projects = useProjects().data ?? [];
  const patch = usePatchTask();
  const [taskOpen, setTaskOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskDto | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-2xl" />;
  if (!data) return <p className="text-sm text-muted-foreground">Project not found.</p>;
  const { project: p, tasks } = data;
  const top = tasks.filter((t) => !t.parentTaskId);
  const today = meta?.today ?? "";
  const toggle = (t: TaskDto) => patch.mutate({ id: t.id, status: t.status === "done" ? "todo" : "done" }, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update") });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-8">
      <Link href="/targets" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
        <ArrowLeft className="size-4" /> Today
      </Link>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">{p.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {nameOf(p.ownerId)}
              {p.startDate && <> · {fmtDateShort(p.startDate)}</>}
              {p.endDate && <> – {fmtDateShort(p.endDate)}</>}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{PROJECT_STATUS_LABELS[p.status as keyof typeof PROJECT_STATUS_LABELS] ?? p.status}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress.pct}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">
          {p.progress.pct}% done · {p.progress.done} of {p.progress.total} tasks
          {p.overdueTasks > 0 && <span className="font-semibold text-red-600"> · {p.overdueTasks} overdue</span>}
        </p>
        {p.description && <p className="whitespace-pre-wrap text-sm">{p.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button className="h-12" onClick={() => setTaskOpen(true)}>
          <Plus className="size-4" /> Add task
        </Button>
        {meta?.can.manageTargets && (
          <Button variant="outline" className="h-12" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Edit project
          </Button>
        )}
      </div>

      {top.length === 0 ? (
        <EmptyState title="No tasks yet" description="Add the first step of this project." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {top.map((t) => {
            const sp = subtaskProgress(t.id, tasks);
            return <TaskRow key={t.id} task={t} today={today} assigneeName={nameOf(t.assigneeId)} subDone={sp.done} subTotal={sp.total} onToggle={toggle} onOpen={setEditTask} busy={patch.isPending} />;
          })}
        </div>
      )}

      <TaskSheet open={taskOpen} onOpenChange={setTaskOpen} meta={meta} projects={projects} defaults={{ projectId: p.id }} />
      <TaskSheet open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)} meta={meta} projects={projects} task={editTask} />
      <ProjectFormSheet open={editOpen} onOpenChange={setEditOpen} meta={meta} project={p} onDeleted={() => router.push("/targets")} />
    </div>
  );
}
