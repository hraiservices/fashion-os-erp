"use client";

import { useReportsData } from "@/hooks/use-reports-data";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export default function MonthlyPnlPage() {
  const { monthly, isLoading } = useReportsData();

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-80 w-full" /></div>;

  return (
    <ReportShell title="Stitching Monthly P&L" description="Stitching orders only — billed vs collected over the last 6 months. For both revenue streams combined, see Combined P&L.">
      <ReportCard className="p-4">
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip
                formatter={(v) => inr(Number(v))}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="billed" name="Billed" stroke="var(--color-primary)" strokeWidth={2} fill="var(--color-primary)" fillOpacity={0.12} />
              <Area type="monotone" dataKey="collected" name="Collected" stroke="#059669" strokeWidth={2} fill="#059669" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <ReportTable>
        <thead className="border-b bg-muted/40">
          <tr>
            <Th>Month</Th>
            <Th align="right">Orders</Th>
            <Th align="right">Billed</Th>
            <Th align="right">Collected</Th>
            <Th align="right">Pending</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {monthly.map((m) => (
            <tr key={m.month} className="hover:bg-muted/30">
              <Td className="font-medium">{m.label}</Td>
              <Td align="right">{m.count}</Td>
              <Td align="right">{inr(m.billed)}</Td>
              <Td align="right" className="text-emerald-600 dark:text-emerald-400">
                {inr(m.collected)}
              </Td>
              <Td align="right">{m.pending > 0 ? <BalanceDue amount={m.pending} /> : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
    </ReportShell>
  );
}
