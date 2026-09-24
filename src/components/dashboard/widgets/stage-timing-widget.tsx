"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Radio, Clock3 } from "lucide-react";
import { useStageTiming } from "@/hooks/use-stage-timing";
import { istDateString } from "@/lib/ist-date";
import { fmtMinutes } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { NumberStat, useLiveRefresh } from "@/components/dashboard/widgets/chart-widget-kit";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

// Same single-hue-per-magnitude-chart shortcut every other widget here uses (revenue-flow,
// tailor-performance, ...) — one bar series, one color.
const BAR_COLOR = "#0ea5e9";

/** Today's stage-change speed, at a glance — how long each stage is taking and who's fastest/
 *  slowest, click through to /reports/stage-timing for the full date-range breakdown and the
 *  per-change audit trail. */
export function StageTimingWidget() {
  const qc = useQueryClient();
  const today = istDateString();
  const { data, isLoading } = useStageTiming({ from: today, to: today });

  useLiveRefresh(qc, [["stage-timing", today, today]]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const byStage = data?.byStage || [];
  const byEmployee = data?.byEmployee || [];
  const fastest = byEmployee[0];
  const slowest = byEmployee[byEmployee.length - 1];

  return (
    <section className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Stage Change Speed</h2>
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Radio className="size-2.5 animate-pulse" /> Live
          </span>
        </div>
        <Link href="/reports/stage-timing" className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
          Full report <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <NumberStat label="Stage changes today" value={data?.summary.count || 0} />
        <div className="min-w-[6rem]">
          <p className="text-xs text-muted-foreground">Avg time per change</p>
          <p className="text-lg font-bold tabular-nums">{data?.summary.avgMinutes != null ? fmtMinutes(data.summary.avgMinutes) : "—"}</p>
        </div>
      </div>

      {byStage.length === 0 ? (
        <EmptyState icon={Clock3} title="No stage changes today" className="border-0 flex-1" />
      ) : (
        <>
          <div className="min-h-40 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStage} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={10} width={32} />
                <Tooltip
                  formatter={(v) => [fmtMinutes(Number(v)), "Avg time in stage"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
                />
                <Bar dataKey="avgMinutes" radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={500}>
                  {byStage.map((b) => (
                    <Cell key={b.stage} fill={BAR_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {(fastest || slowest) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {fastest && (
                <p>
                  ⚡ Fastest today: <span className="font-medium text-foreground">{fastest.name}</span> ({fmtMinutes(fastest.avgMinutes)} avg)
                </p>
              )}
              {slowest && slowest !== fastest && (
                <p>
                  🐢 Slowest today: <span className="font-medium text-foreground">{slowest.name}</span> ({fmtMinutes(slowest.avgMinutes)} avg)
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
