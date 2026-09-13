"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Radio, Users } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useOrders } from "@/hooks/use-orders";
import { useTailorName } from "@/hooks/use-employees";
import { getTailorPerformance } from "@/lib/analytics";
import { rangeStartKey, type ChartRange } from "@/lib/period-buckets";
import { inr, inrCompact } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { LegendDot, NumberStat, useLiveRefresh } from "@/components/dashboard/widgets/chart-widget-kit";
import {
  ComposedChart, Bar, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "6m", label: "6 Months" },
];

// Keeps the chart readable — the leaderboard link goes to the full report for anyone with
// more tailors than fit comfortably on one card.
const MAX_TAILORS_SHOWN = 8;

export function TailorPerformanceWidget() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const tailorName = useTailorName();
  const [range, setRange] = useState<ChartRange>("month");

  const { data: orders, isLoading } = useOrders();

  useLiveRefresh(qc, [["orders"]]);

  const stats = useMemo(() => {
    if (!orders) return [];
    const cutoff = rangeStartKey(range);
    const inRange = orders.filter((o) => o.inDate && o.inDate >= cutoff);
    return getTailorPerformance(inRange).slice(0, MAX_TAILORS_SHOWN);
  }, [orders, range]);

  // Defense in depth — see profit-overview-widget.tsx's identical comment. The dashboard page
  // keeps this out of a non-admin/manager layout entirely (isWidgetVisibleForRole).
  if (user && user.role !== "admin" && user.role !== "manager") return null;

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const chartData = stats.map((s) => ({ ...s, name: tailorName(s.tailor) }));
  const totalRevenue = stats.reduce((s, t) => s + t.revenue, 0);
  const totalOrders = stats.reduce((s, t) => s + t.ordersCount, 0);
  const totalRework = stats.reduce((s, t) => s + t.reworkCount, 0);

  return (
    <section className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Tailor Performance</h2>
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Radio className="size-2.5 animate-pulse" /> Live
          </span>
        </div>
        <Link href="/reports/tailor-workload" className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
          Full report <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="w-full max-w-52">
        <SegmentedToggle value={range} onChange={setRange} options={RANGE_OPTIONS} ariaLabel="Time range" />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <NumberStat label="Revenue" value={totalRevenue} color="var(--color-foreground)" />
        <NumberStat label="Orders" value={totalOrders} />
        <NumberStat label="Rework" value={totalRework} color={totalRework > 0 ? "#ef4444" : undefined} />
      </div>

      {chartData.length === 0 ? (
        <EmptyState icon={Users} title="No tailor activity in this range" className="border-0 flex-1" />
      ) : (
        <>
          <div className="mb-1 flex flex-wrap items-center gap-4">
            <LegendDot color="#0ea5e9" label="Revenue" />
            <LegendDot color="#ef4444" label="Rework count" />
          </div>
          <div className="min-h-52 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-20} textAnchor="end" height={40} />
                <YAxis yAxisId="rev" tickFormatter={(v) => inrCompact(v)} tickLine={false} axisLine={false} fontSize={10} />
                <YAxis yAxisId="rework" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} />
                <Tooltip
                  formatter={(v, name) => [name === "Revenue" ? inr(Number(v)) : v, name]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
                />
                <Bar yAxisId="rev" dataKey="revenue" name="Revenue" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={32} animationDuration={500} />
                <Line yAxisId="rework" type="monotone" dataKey="reworkCount" name="Rework count" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} animationDuration={500} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
