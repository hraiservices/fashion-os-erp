"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ChartBarDuotoneIcon, ClipboardTextDuotoneIcon, UsersDuotoneIcon, WalletDuotoneIcon, WarningDuotoneIcon } from "@/components/icons/duotone-icons";
import { inr } from "@/lib/format";
import { useTargetsMeta, useTargetsSummary } from "@/hooks/use-targets";
import { dueLabel, DUE_TONE_CLASS, useStaffLookup } from "@/components/targets/shared";
import { TargetCard } from "@/components/targets/target-card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Dashboard cards for the Targets module. Each reads the shared /api/targets/summary query, so they cost one request together. */

export function MyTargetsWidget() {
  const { data, isLoading } = useTargetsSummary();
  const meta = useTargetsMeta().data;
  const { nameOf } = useStaffLookup(meta);
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  const targets = (data?.targets ?? []).filter((t) => t.progress.status !== "draft" && t.progress.status !== "cancelled").slice(0, 3);
  return (
    <section className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{data?.scope === "all" ? "Targets" : "My targets"}</h2>
        <Link href="/targets?tab=targets" className="flex items-center gap-1 text-xs text-primary hover:underline">
          All targets <ArrowRight className="size-3" />
        </Link>
      </div>
      {targets.length === 0 ? (
        <EmptyState icon={ChartBarDuotoneIcon} title="No active targets" className="flex-1 border-0" />
      ) : (
        <div className="space-y-2.5">
          {targets.map((t) => (
            <TargetCard key={t.id} target={t} nameOf={nameOf} />
          ))}
        </div>
      )}
    </section>
  );
}

export function TodaysWorkWidget() {
  const { data, isLoading } = useTargetsSummary();
  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;
  const items = [...data.tasksOverdue, ...data.tasksDueToday].slice(0, 5);
  const total = data.tasksOverdue.length + data.tasksDueToday.length;
  return (
    <section className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Today&apos;s work</h2>
          {total > 0 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{total}</span>}
        </div>
        <Link href="/targets" className="flex items-center gap-1 text-xs text-primary hover:underline">
          Open <ArrowRight className="size-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={ClipboardTextDuotoneIcon} title="Nothing due today" description="You are all caught up." className="flex-1 border-0" />
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((t) => {
            const due = dueLabel(t.dueDate, data.today);
            return (
              <li key={t.id}>
                <Link href={t.linkType === "lead" && t.linkId ? `/targets/leads/${t.linkId}` : "/targets"} className="flex min-h-12 items-center gap-3 px-3 py-2 hover:bg-muted/40">
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className={cn("shrink-0 text-xs", DUE_TONE_CLASS[due.tone])}>{due.text}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {total > items.length && <p className="text-xs text-muted-foreground">+ {total - items.length} more</p>}
    </section>
  );
}

export function PipelineValueWidget() {
  const { data, isLoading } = useTargetsSummary();
  if (isLoading || !data) return <Skeleton className="h-24 w-full" />;
  return <StatCard label="Open leads value" value={inr(data.openLeadValue)} icon={UsersDuotoneIcon} href="/targets?tab=leads" hint={`${data.openLeads} open leads · likely ${inr(data.likelyValue)}`} />;
}

export function WonThisMonthWidget() {
  const { data, isLoading } = useTargetsSummary();
  if (isLoading || !data) return <Skeleton className="h-24 w-full" />;
  return <StatCard label="Leads won this month" value={String(data.wonThisMonth.count)} icon={WalletDuotoneIcon} tone={data.wonThisMonth.count > 0 ? "success" : "default"} href="/targets?tab=leads" hint={`Worth ${inr(data.wonThisMonth.value)}`} />;
}

export function TargetsAtRiskWidget() {
  const { data, isLoading } = useTargetsSummary();
  if (isLoading || !data) return <Skeleton className="h-24 w-full" />;
  return <StatCard label="Targets behind pace" value={String(data.targetsAtRisk)} icon={ChartBarDuotoneIcon} tone={data.targetsAtRisk > 0 ? "warning" : "default"} href="/targets?tab=targets" />;
}

export function OverdueTasksWidget() {
  const { data, isLoading } = useTargetsSummary();
  if (isLoading || !data) return <Skeleton className="h-24 w-full" />;
  return <StatCard label="Overdue tasks" value={String(data.overdueTaskCount)} icon={WarningDuotoneIcon} tone={data.overdueTaskCount > 0 ? "danger" : "default"} href="/targets" hint={`${data.openTaskCount} open in total`} />;
}
