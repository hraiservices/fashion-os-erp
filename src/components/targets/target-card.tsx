"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { describeTarget, formatMetricValue, METRIC_LABELS } from "@/lib/targets";
import type { TargetWithProgress } from "@/lib/targets-types";
import { fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProgressBar, TargetStatusChip } from "@/components/targets/shared";

/** "₹60,000 of ₹1,00,000 · 8 days left · behind pace" — a target read as a sentence, one tap to open. */
export function TargetCard({ target, nameOf, className }: { target: TargetWithProgress; nameOf: (id: string) => string; className?: string }) {
  const p = target.progress;
  const { headline, detail } = describeTarget(target.metric, p);
  const who = target.scope === "shop" ? "Whole shop" : target.assigneeIds.map(nameOf).join(", ") || "Nobody yet";
  const expectedPct = p.target > 0 ? (p.expected / p.target) * 100 : 0;

  return (
    <Link href={`/targets/${target.id}`} className={cn("block rounded-xl border bg-card p-4 transition-colors active:bg-muted/50 sm:hover:bg-muted/30", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight">{target.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {who} · {fmtDateShort(target.startDate)} – {fmtDateShort(target.endDate)}
          </p>
        </div>
        <TargetStatusChip status={p.status} />
      </div>

      <p className="mt-3 text-xl font-semibold tabular-nums tracking-tight">{headline}</p>
      <ProgressBar className="mt-2" pct={p.pct} expectedPct={expectedPct} status={p.status} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">{detail}</span>
        {p.likely > 0 && ["on_track", "at_risk", "upcoming"].includes(p.status) && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Star className="size-3.5 fill-amber-400 text-amber-500" />+{formatMetricValue(target.metric, p.likely)} likely
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{METRIC_LABELS[target.metric]}</p>
    </Link>
  );
}
