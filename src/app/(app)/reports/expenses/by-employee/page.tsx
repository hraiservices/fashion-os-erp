"use client";

import { useMemo } from "react";
import { Users, Download } from "lucide-react";
import { useExpenses } from "@/hooks/use-expenses";
import { inr } from "@/lib/format";
import { exportCSV } from "@/lib/export";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/** "Employee" here is whoever was logged in when the expense was recorded (`createdBy`) — this app doesn't have a separate staff/employee directory beyond user accounts. */
export default function ExpensesByEmployeePage() {
  const { data: expenses, isLoading } = useExpenses();

  const rows = useMemo(() => {
    const map = new Map<string, { user: string; count: number; total: number }>();
    (expenses || []).forEach((e) => {
      const key = e.createdBy || "Unknown";
      const row = map.get(key) || { user: key, count: 0, total: 0 };
      row.count += 1;
      row.total += e.amount;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Expenses by Employee"
      description="Expense totals grouped by the user who recorded each one."
      actions={
        rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => exportCSV(rows.map((r) => ({ User: r.user, "Expense Count": r.count, Total: r.total })), "expenses_by_employee")}>
            <Download className="size-4" /> Export CSV
          </Button>
        )
      }
    >
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
