"use client";

import Link from "next/link";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { STAGES, STAGE_META } from "@/lib/business-rules";
import { STAGE_STYLE } from "@/lib/design/stages";
import { inrCompact } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export function PipelineWidget() {
  const { orders, stats, isLoading } = useDashboardStats();
  if (isLoading || !stats) return <Skeleton className="h-80 w-full" />;

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold">Pipeline</h2>
      <div className="space-y-3">
        {STAGES.map((stage) => {
          const count = orders.filter((o) => o.status === stage).length;
          const pct = Math.round((count / stats.stageTotal) * 100);
          const meta = STAGE_META[stage];
          const style = STAGE_STYLE[stage];
          const Icon = style.icon;
          return (
            <Link key={stage} href={`/orders?stage=${stage}`} className="flex items-center gap-2.5 rounded-lg p-1 text-sm transition-colors hover:bg-muted/50">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="w-[4.5rem] shrink-0 truncate text-[13px]">{meta.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${style.accent}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{count}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 space-y-1 border-t pt-4 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Active orders</span>
          <span className="font-medium text-foreground">{stats.active.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Due today</span>
          <span className="font-medium text-foreground">{stats.dueTodayCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Avg order value</span>
          <span className="font-medium text-foreground">{inrCompact(stats.avgOrder)}</span>
        </div>
        <div className="flex justify-between">
          <span>Repeat customers</span>
          <span className="font-medium text-foreground">{stats.repeatRate}%</span>
        </div>
      </div>
    </section>
  );
}
