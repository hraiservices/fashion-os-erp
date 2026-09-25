"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { getOverdueInProduction } from "@/lib/analytics";
import { StageBadge } from "@/components/orders/stage-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const MAX_ROWS = 6;

/** Dashboard-tile version of /reports/overdue — worst delays first, capped to a glance. */
export function OverdueOrdersWidget() {
  const { data: orders, isLoading } = useOrders();
  const overdue = useMemo(() => (orders ? getOverdueInProduction(orders) : []), [orders]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <section className="flex h-full flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Overdue Orders</h2>
          {overdue.length > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {overdue.length}
            </span>
          )}
        </div>
        <Link href="/reports/overdue" className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
          Full report <ArrowRight className="size-3" />
        </Link>
      </div>

      {overdue.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Nothing overdue" description="Every in-production order is still within its delivery date." className="border-0 flex-1" />
      ) : (
        <ul className="flex-1 divide-y overflow-y-auto rounded-lg border">
          {overdue.slice(0, MAX_ROWS).map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.id}</p>
                </div>
                <StageBadge stage={o.status} size="sm" />
                <span className="shrink-0 text-xs font-semibold text-destructive">{o.daysLate}d late</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
