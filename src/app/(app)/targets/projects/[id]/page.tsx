"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateShort } from "@/lib/format";
import { PROJECT_STATUS_LABELS } from "@/lib/work-tasks";
import { useProject, useTargetsMeta } from "@/hooks/use-targets";
import { useStaffLookup } from "@/components/targets/shared";
import { ProjectFormSheet } from "@/components/targets/project-form-sheet";
import { ProjectTasks } from "@/components/targets/project-tasks";
import { ProjectDashboard, ProjectDocuments, ProjectFeed, ProjectPhases, ProjectTimeLogs, ProjectTimesheet, ProjectUsers } from "@/components/targets/project-sections";
import { projectCode } from "@/components/targets/work-ui";
import { cn } from "@/lib/utils";
import { Suspense } from "react";

const TABS = [
  ["dashboard", "Dashboard"],
  ["tasks", "Tasks"],
  ["users", "Users"],
  ["phases", "Phases"],
  ["docs", "Documents"],
  ["time", "Time Logs"],
  ["timesheet", "Timesheet"],
  ["feed", "Feed"],
] as const;
type TabKey = (typeof TABS)[number][0];

function ProjectPageInner({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("t");
  const tab: TabKey = TABS.some(([k]) => k === raw) ? (raw as TabKey) : "tasks";
  const meta = useTargetsMeta().data;
  const { nameOf } = useStaffLookup(meta);
  const { data, isLoading } = useProject(id);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-5xl" />;
  if (!data) return <p className="text-sm text-muted-foreground">Project not found.</p>;
  const { project: p, tasks, lists, phases, memberIds, canManage } = data;
  const today = meta?.today ?? "";
  const go = (t: TabKey) => router.replace(`/targets/projects/${id}?t=${t}`, { scroll: false });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 pb-10">
      <Link href="/targets?tab=projects" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
        <ArrowLeft className="size-4" /> Projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold leading-tight">
            {p.projectNo != null && <span className="mr-2 text-sm font-normal text-muted-foreground">{projectCode(p.projectNo)}</span>}
            {p.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {nameOf(p.ownerId)} · {PROJECT_STATUS_LABELS[p.status as keyof typeof PROJECT_STATUS_LABELS] ?? p.status}
            {p.startDate && <> · {fmtDateShort(p.startDate)}</>}
            {p.endDate && <> – {fmtDateShort(p.endDate)}</>}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress.pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">
              {p.progress.pct}% · {p.progress.done}/{p.progress.total} tasks
              {p.overdueTasks > 0 && <span className="font-semibold text-red-600"> · {p.overdueTasks} overdue</span>}
            </span>
          </div>
        </div>
        {meta?.can.manageTargets && (
          <Button variant="outline" className="h-11" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Edit project
          </Button>
        )}
      </div>

      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0" aria-label="Project sections">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => go(k)} aria-current={tab === k ? "page" : undefined} className={cn("min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium", tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && <ProjectDashboard project={p} tasks={tasks} phases={phases} memberIds={memberIds} today={today} nameOf={nameOf} />}
      {tab === "tasks" && <ProjectTasks project={p} tasks={tasks} lists={lists} canManage={canManage} meta={meta} nameOf={nameOf} />}
      {tab === "users" && <ProjectUsers project={p} memberIds={memberIds} canManage={canManage} meta={meta} nameOf={nameOf} />}
      {tab === "phases" && <ProjectPhases project={p} phases={phases} tasks={tasks} canManage={canManage} />}
      {tab === "docs" && <ProjectDocuments projectId={id} />}
      {tab === "time" && <ProjectTimeLogs project={p} tasks={tasks} meta={meta} nameOf={nameOf} />}
      {tab === "timesheet" && <ProjectTimesheet projectId={id} meta={meta} nameOf={nameOf} />}
      {tab === "feed" && <ProjectFeed projectId={id} />}

      <ProjectFormSheet open={editOpen} onOpenChange={setEditOpen} meta={meta} project={p} onDeleted={() => router.push("/targets?tab=projects")} />
    </div>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 w-full max-w-5xl" />}>
      <ProjectPageInner id={id} />
    </Suspense>
  );
}
