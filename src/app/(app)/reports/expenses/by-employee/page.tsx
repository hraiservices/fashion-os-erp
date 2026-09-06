"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { useExpenses } from "@/hooks/use-expenses";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/** "Employee" here is whoever was logged in when the expense was recorded (`createdBy`) — this app doesn't have a separate staff/employee directory beyond user accounts. */
export default function ExpensesByEmployeePage() {
  const { data: expenses, isLoading } = useExpenses();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows = useMemo(() => {
    const map = new Map<string, { user: string; count: number; total: number }>();
    (expenses || []).filter((e) => isWithinDateRange(e.date, range)).forEach((e) => {
      const key = e.createdBy || "Unknown";
      const row = map.get(key) || { user: key, count: 0, total: 0 };
      row.count += 1;
      row.total += e.amount;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses, range]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Expenses by Employee"
      description="Expense totals grouped by the user who recorded each one."
      actions={
        rows.length > 0 && (
          <ExportMenu rows={rows.map((r) => ({ User: r.user, "Expense Count": r.count, Total: r.total }))} filename="expenses_by_employee" />
        )
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        resultLabel={`${rows.length} user${rows.length === 1 ? "" : "s"}`}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No expenses yet" />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>User</Th>
              <Th align="right">Expenses</Th>
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.user} className="hover:bg-muted/30">
                <Td className="font-medium">{r.user}</Td>
                <Td align="right">{r.count}</Td>
                <Td align="right">{inr(r.total)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
