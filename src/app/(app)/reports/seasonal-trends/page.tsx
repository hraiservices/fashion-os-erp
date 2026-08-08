"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useReportsData } from "@/hooks/use-reports-data";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function SeasonalTrendsPage() {
  const { seasonal, isLoading } = useReportsData();

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-80 w-full" /></div>;

  return (
    <ReportShell title="Seasonal Trends" description="Revenue and order volume across the last 12 months">
      <ReportCard className="p-4">
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={seasonal} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip
                formatter={(v) => inr(Number(v))}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0EA5E9" strokeWidth={2} fill="#0EA5E9" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <ReportTable>
        <thead className="border-b bg-muted/40">
          <tr>
            <Th>Month</Th>
            <Th align="right">Orders</Th>
            <Th align="right">Revenue</Th>
            <Th align="right">Avg order</Th>
            <Th align="right">Growth</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {seasonal.map((m) => {
            const Icon = m.growth > 0 ? TrendingUp : m.growth < 0 ? TrendingDown : Minus;
            const tone = m.growth > 0 ? "text-emerald-600 dark:text-emerald-400" : m.growth < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
            return (
              <tr key={m.month} className="hover:bg-muted/30">
                <Td className="font-medium">{m.label}</Td>
                <Td align="right">{m.count}</Td>
                <Td align="right">{inr(m.revenue)}</Td>
                <Td align="right">{inr(m.avgOrderVal)}</Td>
                <Td align="right">
                  <span className={`inline-flex items-center justify-end gap-1 ${tone}`}>
                    <Icon className="size-3.5" />
                    {m.growth}%
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </ReportTable>
    </ReportShell>
  );
}
