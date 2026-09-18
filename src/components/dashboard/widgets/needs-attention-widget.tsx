"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { DueBadge } from "@/components/orders/stage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function NeedsAttentionWidget() {
  const { stats, isLoading } = useDashboardStats();
  if (isLoading || !stats) return <Skeleton className="h-64 w-full" />;

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="truncate text-sm font-semibold">Needs attention</h2>
        <Link href="/reports/pending-orders" className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
          View all
        </Link>
      </div>
      {stats.urgent.length === 0 ? (
        <EmptyState icon={CalendarClock} title="All caught up" description="Nothing overdue or waiting for pickup." className="border-0" />
      ) : (
        <ul className="divide-y">
          {stats.urgent.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.id}</p>
                </div>
                <DueBadge order={o} />
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
