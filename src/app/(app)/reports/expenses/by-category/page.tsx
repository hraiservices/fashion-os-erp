"use client";

import { useMemo } from "react";
import { PieChart } from "lucide-react";
import { useExpenses } from "@/hooks/use-expenses";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function ExpensesByCategoryPage() {
  const { data: expenses, isLoading } = useExpenses();

  const rows = useMemo(() => {
    const map = new Map<string, { category: string; count: number; total: number }>();
    (expenses || []).forEach((e) => {
      const row = map.get(e.category) || { category: e.category, count: 0, total: 0 };
      row.count += 1;
      row.total += e.amount;
      map.set(e.category, row);
    });
    const grandTotal = Array.from(map.values()).reduce((s, r) => s + r.total, 0);
    return Array.from(map.values())
      .map((r) => ({ ...r, pct: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Expenses by Category"
      description="Where expense spend goes, grouped by category."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((r) => ({ Category: r.category, "Expense Count": r.count, Total: r.total, "% of Total": r.pct.toFixed(1) }))}
            filename="expenses_by_category"
          />
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={PieChart} title="No expenses yet" />
      ) : (
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
      )}
    </ReportShell>
  );
}
