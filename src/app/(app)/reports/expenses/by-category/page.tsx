"use client";

import { useMemo, useState } from "react";
import { PieChart } from "lucide-react";
import { useExpenses } from "@/hooks/use-expenses";
import { useEmployees } from "@/hooks/use-employees";
import { expensePayeeKey, expensePayeeName } from "@/lib/expense-payee";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";

type CategoryRow = { category: string; count: number; total: number; pct: number };

const SORT_COMPARATORS: Record<string, (a: CategoryRow, b: CategoryRow) => number> = {
  category: (a, b) => a.category.localeCompare(b.category),
  count: (a, b) => a.count - b.count,
  total: (a, b) => a.total - b.total,
  pct: (a, b) => a.pct - b.pct,
};
const SORT_DESC_KEYS = new Set(["count", "total", "pct"]);

export default function ExpensesByCategoryPage() {
  const { data: expenses, isLoading } = useExpenses();
  const { data: employees } = useEmployees();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [payMethod, setPayMethod] = useState("all");
  const [payee, setPayee] = useState("all");

  const payMethods = useMemo(() => Array.from(new Set((expenses || []).map((e) => e.payMethod).filter(Boolean))).sort(), [expenses]);
  const employeeNameById = useMemo(() => new Map((employees || []).map((e) => [e.id, e.name])), [employees]);
  const payees = useMemo(() => {
    const map = new Map<string, string>();
    (expenses || []).forEach((e) => {
      const key = expensePayeeKey(e);
      if (key === "unlinked") return;
      map.set(key, expensePayeeName(e, employeeNameById));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [expenses, employeeNameById]);

  const rows = useMemo(() => {
    const map = new Map<string, { category: string; count: number; total: number }>();
    (expenses || [])
      .filter((e) => isWithinDateRange(e.date, range))
      .filter((e) => payMethod === "all" || e.payMethod === payMethod)
      .filter((e) => payee === "all" || expensePayeeKey(e) === payee)
      .forEach((e) => {
        const row = map.get(e.category) || { category: e.category, count: 0, total: 0 };
        row.count += 1;
        row.total += e.amount;
        map.set(e.category, row);
      });
    const grandTotal = Array.from(map.values()).reduce((s, r) => s + r.total, 0);
    return Array.from(map.values())
      .map((r) => ({ ...r, pct: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, range, payMethod, payee]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<CategoryRow>("expenses-by-category", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Expenses by Category"
      description="Where expense spend goes, grouped by category."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((r) => ({ Category: r.category, "Expense Count": r.count, Total: r.total, "% of Total": r.pct.toFixed(1) }))}
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
        category={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select value={payMethod} onValueChange={(v) => v && setPayMethod(v)}>
              <SelectTrigger className="h-9 w-full sm:w-40">
                <SelectValue>{payMethod === "all" ? "All Methods" : payMethod}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {payMethods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={payee} onValueChange={(v) => v && setPayee(v)}>
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue>{payee === "all" ? "All Employees/Customers" : payees.find(([k]) => k === payee)?.[1] || "All Employees/Customers"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees/Customers</SelectItem>
                {payees.map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={PieChart} title="No expenses yet" />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="category" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Category</Th>
                  <Th align="right" sortKey="count" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Expenses</Th>
                  <Th align="right" sortKey="total" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Total</Th>
                  <Th align="right" sortKey="pct" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>% of Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{rows.reduce((s, r) => s + r.count, 0)}</Td>
                  <Td align="right">{inr(rows.reduce((s, r) => s + r.total, 0))}</Td>
                  <Td align="right">100%</Td>
                </ReportTotalsRow>
                {sortedRows.map((r) => (
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
              <MobileRecordHeader boldTitle title="Total" value={inr(rows.reduce((s, r) => s + r.total, 0))} showChevron={false} valueClassName="text-red-600 dark:text-red-400" />
              <MobileRecordRow label="Expenses" value={rows.reduce((s, r) => s + r.count, 0)} />
              <MobileRecordRow label="% of Total" value="100%" />
            </MobileRecordCard>
            {sortedRows.map((r) => (
              <MobileRecordCard key={r.category}>
                <MobileRecordHeader boldTitle title={r.category} value={inr(r.total)} showChevron={false} valueClassName="text-red-600 dark:text-red-400" />
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
