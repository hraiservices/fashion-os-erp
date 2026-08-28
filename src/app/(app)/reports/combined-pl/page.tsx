"use client";

import { useMemo } from "react";
import { useCombinedPl } from "@/hooks/use-combined-pl";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Receipt } from "lucide-react";

export default function CombinedPlPage() {
  const { monthly, isLoading } = useCombinedPl();

  const totals = useMemo(
    () => monthly.reduce((acc, m) => ({ revenue: acc.revenue + m.revenue, cost: acc.cost + m.totalCost, net: acc.net + m.netProfit }), { revenue: 0, cost: 0, net: 0 }),
    [monthly]
  );

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell title="Combined P&L" description="All revenue (stitching + product sales) against all costs — purchases, stitching job costs, manufacturing labour, shop expenses and salaries — last 6 months">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Revenue" value={inr(totals.revenue)} icon={TrendingUp} tone="success" />
        <StatCard label="Total Cost" value={inr(totals.cost)} icon={TrendingDown} tone="danger" />
        <StatCard label="Net Profit" value={inr(totals.net)} icon={Wallet} tone={totals.net >= 0 ? "success" : "danger"} />
        <StatCard label="Margin" value={totals.revenue > 0 ? `${Math.round((totals.net / totals.revenue) * 100)}%` : "—"} icon={Receipt} />
      </div>

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
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0ea5e9" strokeWidth={2} fill="#0ea5e9" fillOpacity={0.12} />
              <Area type="monotone" dataKey="totalCost" name="Cost" stroke="#ef4444" strokeWidth={2} fill="#ef4444" fillOpacity={0.12} />
              <Area type="monotone" dataKey="netProfit" name="Net Profit" stroke="#059669" strokeWidth={2} fill="#059669" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <ReportTable>
        <thead className="border-b bg-muted/40">
          <tr>
            <Th>Month</Th>
            <Th align="right">Stitching Rev</Th>
            <Th align="right">Product Sales Rev</Th>
            <Th align="right">Purchases</Th>
            <Th align="right">Stitching Cost</Th>
            <Th align="right">Mfg Labor</Th>
            <Th align="right">Expenses</Th>
            <Th align="right">Salaries</Th>
            <Th align="right">Net Profit</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {monthly.map((m) => (
            <tr key={m.month} className="hover:bg-muted/30">
              <Td className="font-medium">{m.label}</Td>
              <Td align="right">{inr(m.stitchingRevenue)}</Td>
              <Td align="right">{inr(m.salesRevenue)}</Td>
              <Td align="right" className="text-muted-foreground">
                {inr(m.purchaseCost)}
              </Td>
              <Td align="right" className="text-muted-foreground">
                {inr(m.stitchingCost)}
              </Td>
              <Td align="right" className="text-muted-foreground">
                {inr(m.laborCost)}
              </Td>
              <Td align="right" className="text-muted-foreground">
                {inr(m.expenseCost)}
              </Td>
              <Td align="right" className="text-muted-foreground">
                {inr(m.payrollCost)}
              </Td>
              <Td align="right" className={`font-semibold ${m.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {inr(m.netProfit)}
              </Td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
      <p className="text-xs text-muted-foreground">
        Stitching Cost is booked by each order&apos;s intake date, but Salaries is booked by when a payslip was actually paid — a garment taken in one month whose tailor is paid via a
        later payroll run shows its cost in the earlier month and the matching salary reduction in the later one. Totals across the full period are still correct either way; a single
        month&apos;s Net Profit can shift a little depending on payroll timing.
      </p>
    </ReportShell>
  );
}
