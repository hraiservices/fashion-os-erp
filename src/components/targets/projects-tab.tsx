"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtDateShort } from "@/lib/format";
import { isProjectOverdue, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/work-tasks";
import type { ProjectWithProgress } from "@/lib/targets-types";
import { useProjects, type TargetsMeta } from "@/hooks/use-targets";
import { useStaffLookup } from "@/components/targets/shared";
import { projectCode } from "@/components/targets/work-ui";
import { cn } from "@/lib/utils";

const STATUS_CELL: Record<string, string> = {
  active: "bg-teal-500 text-white",
  planned: "bg-slate-400 text-white",
  on_hold: "bg-amber-500 text-white",
  done: "bg-emerald-600 text-white",
  cancelled: "bg-zinc-400 text-white",
};
const statusText = (s: string) => PROJECT_STATUS_LABELS[s as ProjectStatus] ?? s;

/** Projects: a table on desktop (ID, name, %, owner, status, tasks, dates) and cards on a phone. */
export function ProjectsTab({ meta }: { meta: TargetsMeta | undefined }) {
  const router = useRouter();
  const q = useProjects();
  const { nameOf } = useStaffLookup(meta);
  const projects = q.data ?? [];
  const today = meta?.today ?? "";
  const th = "whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-muted-foreground";
  const end = (p: ProjectWithProgress) => (p.endDate ? <span className={cn(isProjectOverdue(p, today) && "text-red-600")}>{fmtDateShort(p.endDate)}</span> : "–");

  return (
    <div className="space-y-3">
      {meta?.can.manageTargets && (
        <Button className="h-11 w-full sm:w-auto" onClick={() => router.push("/targets/projects/new")}>
          <Plus className="size-4" /> New project
        </Button>
      )}

      {q.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
      {!q.isLoading && projects.length === 0 && <EmptyState title="No projects yet" description="A project groups tasks that share a goal, a team and a date range." />}

      {projects.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border bg-card lg:block">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className={cn(th, "w-20")}>ID</th>
                <th className={th}>Project name</th>
                <th className={th}>% done</th>
                <th className={th}>Owner</th>
                <th className={th}>Status</th>
                <th className={th}>Tasks</th>
                <th className={th}>Start date</th>
                <th className={th}>End date</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => router.push(`/targets/projects/${p.id}`)}>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{projectCode(p.projectNo)}</td>
                  <td className="px-3 font-medium">
                    <Link href={`/targets/projects/${p.id}`} className="hover:text-primary" onClick={(e) => e.stopPropagation()}>
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 tabular-nums">{p.progress.pct}%</td>
                  <td className="px-3 whitespace-nowrap">{nameOf(p.ownerId)}</td>
                  <td className="px-3">
                    <span className={cn("inline-flex min-w-20 justify-center rounded px-2.5 py-1.5 text-xs font-semibold", STATUS_CELL[p.status] ?? STATUS_CELL.active)}>{statusText(p.status)}</span>
                  </td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${p.progress.pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {p.progress.done}/{p.progress.total}
                        {p.overdueTasks > 0 && <span className="ml-1 text-red-600">· {p.overdueTasks} late</span>}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 text-muted-foreground">{p.startDate ? fmtDateShort(p.startDate) : "–"}</td>
                  <td className="whitespace-nowrap px-3">{end(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-3 lg:hidden">
        {projects.map((p) => (
          <Link key={p.id} href={`/targets/projects/${p.id}`} className="block rounded-xl border bg-card p-4 active:bg-muted/50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {projectCode(p.projectNo)} · {nameOf(p.ownerId)}
                </p>
              </div>
              <span className={cn("shrink-0 rounded px-2 py-1 text-xs font-semibold", STATUS_CELL[p.status] ?? STATUS_CELL.active)}>{statusText(p.status)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress.pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {p.progress.pct}% done · {p.progress.done}/{p.progress.total} tasks
              {p.endDate && <> · ends {end(p)}</>}
              {p.overdueTasks > 0 && <span className="font-semibold text-red-600"> · {p.overdueTasks} overdue</span>}
            </p>
          </Link>
        ))}
      </div>

    </div>
  );
}
