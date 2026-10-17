"use client";

import { inr } from "@/lib/format";
import { OPEN_STAGES, stageLabel, type StageLabelOverrides } from "@/lib/lead-stages";
import type { LeadDto } from "@/lib/targets-types";
import { STAGE_STYLE } from "@/components/targets/shared";
import { cn } from "@/lib/utils";

/** The open pipeline at a glance: how many leads, and how much money, sit at each stage (New → Quoted). */
export function LeadFunnel({ leads, labels }: { leads: LeadDto[]; labels?: StageLabelOverrides }) {
  const rows = OPEN_STAGES.map((s) => {
    const inStage = leads.filter((l) => l.stage === s);
    return { stage: s, count: inStage.length, value: inStage.reduce((a, l) => a + l.expectedValue, 0) };
  });
  const open = rows.reduce((a, r) => a + r.count, 0);
  if (open === 0) return null;
  const total = rows.reduce((a, r) => a + r.value, 0);
  const maxValue = Math.max(1, ...rows.map((r) => r.value));
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <section className="space-y-2 rounded-xl border bg-card p-3" aria-label="Pipeline">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold">Pipeline</p>
        <p className="text-xs text-muted-foreground">
          {open} open · <span className="font-medium text-foreground">{inr(total)}</span> expected
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((r) => (
          <div key={r.stage} className={cn("space-y-1 rounded-lg border px-3 py-2", STAGE_STYLE[r.stage])}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{stageLabel(r.stage, labels)}</span>
              <span className="text-sm font-bold tabular-nums">{r.count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
              <div className="h-full rounded-full bg-current opacity-60" style={{ width: `${r.value > 0 ? Math.max(6, (r.value / maxValue) * 100) : (r.count / maxCount) * 20}%` }} />
            </div>
            <p className="text-xs tabular-nums opacity-80">{r.value > 0 ? inr(r.value) : "—"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
