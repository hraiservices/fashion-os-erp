"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, LineChart as LineChartIcon, Radio } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useOrders } from "@/hooks/use-orders";
import { getPipelineVelocity } from "@/lib/analytics";
import { bucketsForRange, type ChartRange } from "@/lib/period-buckets";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { LegendDot, NumberStat, useLiveRefresh } from "@/components/dashboard/widgets/chart-widget-kit";
import {
  ComposedChart, Bar, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

type ChartKind = "bar" | "line";

const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "6m", label: "6 Months" },
];

const CHART_OPTIONS: { value: ChartKind; label: string; icon: typeof BarChart3 }[] = [
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "line", label: "Line", icon: LineChartIcon },
];

export function PipelineVelocityWidget() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const [range, setRange] = useState<ChartRange>("month");
  const [chartKind, setChartKind] = useState<ChartKind>("bar");

  const { data: orders, isLoading } = useOrders();

  useLiveRefresh(qc, [["orders"]]);

  const data = useMemo(() => {
    if (!orders) return [];
    return getPipelineVelocity(orders, bucketsForRange(range));
  }, [orders, range]);

  // Defense in depth — see profit-overview-widget.tsx's identical comment. The dashboard page
  // keeps this out of a non-admin/manager layout entirely (isWidgetVisibleForRole).
  if (user && user.role !== "admin" && user.role !== "manager") return null;

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const withData = data.filter((d) => d.avgDaysToReady !== null);
  const avgAcrossRange = withData.length
    ? Math.round((withData.reduce((s, d) => s + (d.avgDaysToReady || 0), 0) / withData.length) * 10) / 10
    : 0;
  const withPromise = data.filter((d) => d.onTimePct !== null);
  const avgOnTimePct = withPromise.length
    ? Math.round(withPromise.reduce((s, d) => s + (d.onTimePct || 0), 0) / withPromise.length)
    : 0;
  const totalCompleted = data.reduce((s, d) => s + d.completedCount, 0);

  return (
    <section className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Pipeline Velocity</h2>
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Radio className="size-2.5 animate-pulse" /> Live
          </span>
        </div>
        <Link href="/reports/tailor-workload" className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
          Full report <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full max-w-52 sm:w-auto">
          <SegmentedToggle value={range} onChange={setRange} options={RANGE_OPTIONS} ariaLabel="Time range" />
        </div>
        <div className="w-full max-w-36 sm:w-auto">
          <SegmentedToggle value={chartKind} onChange={setChartKind} options={CHART_OPTIONS} ariaLabel="Chart type" />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <NumberStat label="Avg Days to Ready" value={avgAcrossRange} suffix="d" />
        <NumberStat label="On-Time %" value={avgOnTimePct} suffix="%" color={avgOnTimePct >= 80 ? "#10b981" : avgOnTimePct >= 50 ? "#f59e0b" : "#ef4444"} />
        <NumberStat label="Orders Completed" value={totalCompleted} />
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-4">
        <LegendDot color="#0ea5e9" label="Avg days to Ready" />
        <LegendDot color="#10b981" label="On-time %" />
      </div>

      <div className="min-h-52 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis yAxisId="days" tickLine={false} axisLine={false} fontSize={10} />
            <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} fontSize={10} />
            <Tooltip
              formatter={(v, name) => [name === "On-time %" ? `${v}%` : `${v} days`, name]}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
            />
            {chartKind === "bar" ? (
              <Bar yAxisId="days" dataKey="avgDaysToReady" name="Avg days to Ready" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={500} />
            ) : (
              <Line yAxisId="days" type="monotone" dataKey="avgDaysToReady" name="Avg days to Ready" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} animationDuration={500} />
            )}
            <Line yAxisId="pct" type="monotone" dataKey="onTimePct" name="On-time %" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} animationDuration={500} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
