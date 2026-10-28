"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { useExpenses } from "@/hooks/use-expenses";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

const MONTHS_SHOWN = 6;
// A fixed, distinct-hue palette (not derived from CSS vars) so each payment method keeps the
// same color across the bar segments and the legend/table below, how ever many methods exist.
const METHOD_COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d"];

export default function ExpenseTrendsPage() {
  const { data: expenses, isLoading } = useExpenses();

  const { monthly, methodTotals, methods, grandTotal } = useMemo(() => {
    const now = new Date();
    const monthBuckets: { key: string; label: string }[] = [];
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthBuckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) });
    }
    const monthByKey = new Map(monthBuckets.map((m) => [m.key, m]));

    const methodSet = new Set<string>();
    (expenses || []).forEach((e) => methodSet.add(e.payMethod || "Other"));
    const methods = Array.from(methodSet).sort();

    const monthly: Record<string, string | number>[] = monthBuckets.map((m) => ({ label: m.label }));
    const monthRowByKey = new Map(monthBuckets.map((m, i) => [m.key, monthly[i]]));
    const methodTotals = new Map<string, number>(methods.map((m) => [m, 0]));

    (expenses || []).forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthByKey.has(key)) return;
      const row = monthRowByKey.get(key)!;
      const method = e.payMethod || "Other";
      row[method] = ((row[method] as number) || 0) + e.amount;
      methodTotals.set(method, (methodTotals.get(method) || 0) + e.amount);
    });

    const grandTotal = Array.from(methodTotals.values()).reduce((s, v) => s + v, 0);
    return { monthly, methodTotals, methods, grandTotal };
  }, [expenses]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  const methodRows = methods
    .map((m) => ({ method: m, total: methodTotals.get(m) || 0, pct: grandTotal > 0 ? ((methodTotals.get(m) || 0) / grandTotal) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);

  return (
    <ReportShell
      title="Expense Trends"
      description={`Monthly spend by payment method, last ${MONTHS_SHOWN} months.`}
      actions={
        <ReportActionsMenu
          rows={methodRows.map((r) => ({ "Payment Method": r.method, Total: r.total, "% of Total": r.pct.toFixed(1) }))}
          filename="expense-trends"
          title="Expense Trends"
          summaryLines={[`Payment methods: ${methods.length}`, `Total (last ${MONTHS_SHOWN} months): ${inr(grandTotal)}`]}
        />
      }
    >
      {(expenses?.length ?? 0) === 0 ? (
        <EmptyState icon={TrendingUp} title="No expenses yet" description="Trends will appear once you've recorded some expenses." />
      ) : (
        <>
          <ReportCard className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Monthly spend by payment method</h2>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip
                    formatter={(v) => inr(Number(v))}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
                  />
                  {methods.map((m, i) => (
                    <Bar key={m} dataKey={m} stackId="expense" fill={METHOD_COLORS[i % METHOD_COLORS.length]} radius={i === methods.length - 1 ? [4, 4, 0, 0] : undefined}>
                      {monthly.map((_, idx) => (
                        <Cell key={idx} />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {methods.map((m, i) => (
                <span key={m} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2.5 rounded-sm" style={{ background: METHOD_COLORS[i % METHOD_COLORS.length] }} />
                  {m}
                </span>
              ))}
            </div>
          </ReportCard>

          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Payment Method</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">% of Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{inr(grandTotal)}</Td>
                  <Td align="right">100%</Td>
                </ReportTotalsRow>
                {methodRows.map((r) => (
                  <tr key={r.method} className="hover:bg-muted/30">
                    <Td className="font-medium">{r.method}</Td>
                    <Td align="right">{inr(r.total)}</Td>
                    <Td align="right" className="text-muted-foreground">{r.pct.toFixed(1)}%</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader boldTitle title="Total" value={inr(grandTotal)} showChevron={false} />
              <MobileRecordRow label="% of Total" value="100%" />
            </MobileRecordCard>
            {methodRows.map((r) => (
              <MobileRecordCard key={r.method}>
                <MobileRecordHeader boldTitle title={r.method} value={inr(r.total)} showChevron={false} />
                <MobileRecordRow label="% of Total" value={`${r.pct.toFixed(1)}%`} valueClassName="text-muted-foreground" />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
