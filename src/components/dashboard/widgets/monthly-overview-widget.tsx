"use client";

import Link from "next/link";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { inr, inrCompact } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function MonthlyOverviewWidget() {
  const { stats, isLoading } = useDashboardStats();
  if (isLoading || !stats) return <Skeleton className="h-72 w-full" />;

  return (
    <Link href="/reports/monthly" className="block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/20">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Monthly Overview</h2>
        <span className="text-xs text-muted-foreground">View report</span>
      </div>
      <div className="mb-3 flex items-center gap-4">
        <LegendDot color="#0ea5e9" label="Billed" />
        <LegendDot color="#10b981" label="Collected" />
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.monthly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickFormatter={(v) => inrCompact(v)} tickLine={false} axisLine={false} fontSize={10} />
            <Tooltip
              formatter={(v, name) => [inr(Number(v)), name]}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
            />
            <Bar dataKey="billed" name="Billed" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Link>
  );
}
