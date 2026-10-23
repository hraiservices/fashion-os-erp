"use client";

import { useMemo, useState } from "react";
import { UsersDuotoneIcon } from "@/components/icons/duotone-icons";
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

type ByEmployeeRow = { user: string; count: number; total: number };

const SORT_COMPARATORS: Record<string, (a: ByEmployeeRow, b: ByEmployeeRow) => number> = {
  user: (a, b) => a.user.localeCompare(b.user),
  count: (a, b) => a.count - b.count,
  total: (a, b) => a.total - b.total,
};
const SORT_DESC_KEYS = new Set(["count", "total"]);

/** Grouped by who the expense was paid to/for — a linked employee when there is one, else the
 *  free-text customer name, else an "Unlinked" bucket — so e.g. Salaries & Wages can be broken
 *  down by which tailor got paid, not by which staff member logged the expense into the app. */
export default function ExpensesByEmployeePage() {
  const { data: expenses, isLoading } = useExpenses();
  const { data: employees } = useEmployees();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [category, setCategory] = useState("all");

  const employeeNameById = useMemo(() => new Map((employees || []).map((e) => [e.id, e.name])), [employees]);
  const categories = useMemo(() => Array.from(new Set((expenses || []).map((e) => e.category).filter(Boolean))).sort(), [expenses]);

  const rows = useMemo(() => {
    const map = new Map<string, { user: string; count: number; total: number }>();
    (expenses || [])
      .filter((e) => isWithinDateRange(e.date, range))
      .filter((e) => category === "all" || e.category === category)
      .forEach((e) => {
        const key = expensePayeeKey(e);
        const name = key === "unlinked" ? "Unlinked" : expensePayeeName(e, employeeNameById);
        const row = map.get(key) || { user: name, count: 0, total: 0 };
        row.count += 1;
        row.total += e.amount;
        map.set(key, row);
      });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses, range, category, employeeNameById]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<ByEmployeeRow>("expenses-by-employee", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Expenses by Employee"
      description="Expense totals grouped by who the expense was paid to or for."
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((r) => ({ "Employee/Customer": r.user, "Expense Count": r.count, Total: r.total }))}
          filename="expenses-by-employee"
          title="Expenses by Employee"
          summaryLines={[`Users: ${rows.length}`, `Total: ${inr(rows.reduce((s, r) => s + r.total, 0))}`]}
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
        resultLabel={`${rows.length} user${rows.length === 1 ? "" : "s"}`}
        category={
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{category === "all" ? "All Categories" : category}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={UsersDuotoneIcon} title="No expenses yet" />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="user" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Employee/Customer</Th>
                  <Th align="right" sortKey="count" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Expenses</Th>
                  <Th align="right" sortKey="total" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{rows.reduce((s, r) => s + r.count, 0)}</Td>
                  <Td align="right">{inr(rows.reduce((s, r) => s + r.total, 0))}</Td>
                </ReportTotalsRow>
                {sortedRows.map((r) => (
                  <tr key={r.user} className="hover:bg-muted/30">
                    <Td className="font-medium">{r.user}</Td>
                    <Td align="right">{r.count}</Td>
                    <Td align="right">{inr(r.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader boldTitle title="Total" value={inr(rows.reduce((s, r) => s + r.total, 0))} showChevron={false} valueClassName="text-red-600 dark:text-red-400" />
              <MobileRecordRow label="Expenses" value={rows.reduce((s, r) => s + r.count, 0)} />
            </MobileRecordCard>
            {sortedRows.map((r) => (
              <MobileRecordCard key={r.user}>
                <MobileRecordHeader boldTitle title={r.user} value={inr(r.total)} showChevron={false} valueClassName="text-red-600 dark:text-red-400" />
                <MobileRecordRow label="Expenses" value={r.count} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
