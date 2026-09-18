"use client";

import Link from "next/link";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { useTailorName } from "@/hooks/use-employees";
import { inr } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

export function TailorLoadWidget() {
  const { stats, isLoading } = useDashboardStats();
  const tailorName = useTailorName();
  if (isLoading || !stats) return <Skeleton className="h-64 w-full" />;

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="truncate text-sm font-semibold">Tailor load</h2>
        <Link href="/reports/tailor-workload" className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
          View all
        </Link>
      </div>
      {stats.tailorStats.length === 0 ? (
        <EmptyState icon={Users} title="No tailors assigned yet" className="border-0" />
      ) : (
        <ul className="divide-y">
          {stats.tailorStats.map((t) => (
            <li key={t.tailor} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{tailorName(t.tailor)}</span>
              <span className="text-xs text-muted-foreground">{t.active} active</span>
              {t.overdue > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{t.overdue} overdue</span>
              )}
              <span className="w-16 shrink-0 text-right tabular-nums">{inr(t.revenue)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
