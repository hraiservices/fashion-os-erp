"use client";

import Link from "next/link";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { inr, inrCompact } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip, CartesianGrid } from "recharts";

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function RevenueFlowWidget() {
  const { stats, isLoading } = useDashboardStats();
  if (isLoading || !stats) return <Skeleton className="h-80 w-full" />;

  return (
    <Link href="/reports/monthly" className="block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/20">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Revenue Flow</h2>
        <span className="text-xs text-muted-foreground">Last 6 months</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <LegendDot color="#0ea5e9" label={`Billed  ${inrCompact(stats.monthly.reduce((s, m) => s + m.billed, 0))}`} />
        <LegendDot color="#10b981" label={`Collected  ${inrCompact(stats.monthly.reduce((s, m) => s + m.collected, 0))}`} />
        <LegendDot color="#f97316" label={`Pending  ${inrCompact(stats.monthly.reduce((s, m) => s + m.pending, 0))}`} />
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats.monthly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="gBilled2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gCollected2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <Tooltip
              formatter={(v, name) => [inr(Number(v)), name]}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
            />
            <Area type="monotone" dataKey="billed" name="Billed" stroke="#0ea5e9" strokeWidth={2} fill="url(#gBilled2)" dot={{ r: 3, fill: "#0ea5e9" }} />
            <Area type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} fill="url(#gCollected2)" dot={{ r: 3, fill: "#10b981" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Link>
  );
}
