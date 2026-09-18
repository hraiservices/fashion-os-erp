"use client";

import { useMemo } from "react";
import { PieChart } from "lucide-react";
import { useExpenses } from "@/hooks/use-expenses";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

export default function ExpensesByCategoryPage() {
  const { data: expenses, isLoading } = useExpenses();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows = useMemo(() => {
    const map = new Map<string, { category: string; count: number; total: number }>();
    (expenses || []).filter((e) => isWithinDateRange(e.date, range)).forEach((e) => {
      const row = map.get(e.category) || { category: e.category, count: 0, total: 0 };
      row.count += 1;
      row.total += e.amount;
      map.set(e.category, row);
    });
    const grandTotal = Array.from(map.values()).reduce((s, r) => s + r.total, 0);
    return Array.from(map.values())
      .map((r) => ({ ...r, pct: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Expenses by Category"
      description="Where expense spend goes, grouped by category."
      actions={
        <ReportActionsMenu
          rows={rows.map((r) => ({ Category: r.category, "Expense Count": r.count, Total: r.total, "% of Total": r.pct.toFixed(1) }))}
          filename="expenses-by-category"
          title="Expenses by Category"
          summaryLines={[`Categories: ${rows.length}`, `Total: ${inr(rows.reduce((s, r) => s + r.total, 0))}`]}
        />
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        resultLabel={`${rows.length} categor${rows.length === 1 ? "y" : "ies"}`}
      />

      {rows.length === 0 ? (
        <EmptyState icon={PieChart} title="No expenses yet" />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Category</Th>
                  <Th align="right">Expenses</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">% of Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{rows.reduce((s, r) => s + r.count, 0)}</Td>
                  <Td align="right">{inr(rows.reduce((s, r) => s + r.total, 0))}</Td>
                  <Td align="right">100%</Td>
                </ReportTotalsRow>
                {rows.map((r) => (
                  <tr key={r.category} className="hover:bg-muted/30">
                    <Td className="font-medium">{r.category}</Td>
                    <Td align="right">{r.count}</Td>
                    <Td align="right">{inr(r.total)}</Td>
                    <Td align="right" className="text-muted-foreground">{r.pct.toFixed(1)}%</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(rows.reduce((s, r) => s + r.total, 0))} showChevron={false} />
              <MobileRecordRow label="Expenses" value={rows.reduce((s, r) => s + r.count, 0)} />
              <MobileRecordRow label="% of Total" value="100%" />
            </MobileRecordCard>
            {rows.map((r) => (
              <MobileRecordCard key={r.category}>
                <MobileRecordHeader title={r.category} value={inr(r.total)} showChevron={false} />
                <MobileRecordRow label="Expenses" value={r.count} />
                <MobileRecordRow label="% of Total" value={`${r.pct.toFixed(1)}%`} valueClassName="text-muted-foreground" />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
