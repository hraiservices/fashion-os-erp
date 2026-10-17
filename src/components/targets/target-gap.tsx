"use client";

import Link from "next/link";
import { Target } from "lucide-react";
import { useTargetsSummary } from "@/hooks/use-targets";
import { inr } from "@/lib/format";
import { METRIC_LABELS, type TargetMetric } from "@/lib/targets";
import { cn } from "@/lib/utils";

const fmt = (metric: string, n: number) => (metric === "sales_value" ? inr(Math.max(0, Math.round(n))) : String(Math.max(0, Math.ceil(n))));

/** "How far to go" for the running targets: what is left, the days left, and the pace needed each day. */
export function TargetGapCard() {
  const { data } = useTargetsSummary({ quiet: true });
  const rows = (data?.targets ?? [])
    .filter((t) => (t.progress.status === "on_track" || t.progress.status === "at_risk") && t.progress.remaining > 0 && t.progress.daysLeft > 0)
    .sort((a, b) => (a.progress.status === "at_risk" ? 0 : 1) - (b.progress.status === "at_risk" ? 0 : 1))
    .slice(0, 2);
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      {rows.map((t) => {
        const p = t.progress;
        const perDay = p.remaining / p.daysLeft;
        const risk = p.status === "at_risk";
        return (
          <Link key={t.id} href="/targets?tab=targets" className={cn("flex min-h-14 items-center gap-3 rounded-xl border p-3 text-sm", risk ? "border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/5" : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5")}>
            <Target className={cn("size-5 shrink-0", risk ? "text-amber-600" : "text-emerald-600")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{t.title}</span>
              <span className="block text-xs text-muted-foreground">
                {fmt(t.metric, p.remaining)} {t.metric === "sales_value" ? "" : (METRIC_LABELS[t.metric as TargetMetric] ?? "").toLowerCase() + " "}to go · {p.daysLeft} {p.daysLeft === 1 ? "day" : "days"} left
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums">{fmt(t.metric, perDay)}</span>
              <span className="block text-[11px] text-muted-foreground">needed a day</span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}
