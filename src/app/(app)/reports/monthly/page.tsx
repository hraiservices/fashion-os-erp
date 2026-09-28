"use client";

import { useMemo } from "react";
import { useReportsData } from "@/hooks/use-reports-data";
import { useExpenses } from "@/hooks/use-expenses";
import { useEmployees } from "@/hooks/use-employees";
import { useAllPayslips } from "@/hooks/use-payroll";
import { getStitchingPnl } from "@/lib/analytics";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";

type MonthlyRow = ReturnType<typeof getStitchingPnl>[number];

const SORT_COMPARATORS: Record<string, (a: MonthlyRow, b: MonthlyRow) => number> = {
  month: (a, b) => a.label.localeCompare(b.label),
  count: (a, b) => a.count - b.count,
  billed: (a, b) => a.billed - b.billed,
  collected: (a, b) => a.collected - b.collected,
  pending: (a, b) => a.pending - b.pending,
  tailoringExpense: (a, b) => a.tailoringExpense - b.tailoringExpense,
  tailorSalaryExpense: (a, b) => a.tailorSalaryExpense - b.tailorSalaryExpense,
  tailorPayrollCost: (a, b) => a.tailorPayrollCost - b.tailorPayrollCost,
  netProfit: (a, b) => a.netProfit - b.netProfit,
};
const SORT_DESC_KEYS = new Set(["count", "billed", "collected", "pending", "tailoringExpense", "tailorSalaryExpense", "tailorPayrollCost", "netProfit"]);

/** The month buckets shown are always the trailing 6 months (see getStitchingPnl) — the date
 *  range narrows which orders/expenses/payslips count toward each bucket, not the window of
 *  months shown.
 *
 *  Cost side (see getStitchingPnl in @/lib/analytics for the full rule): expenses filed under a
 *  category containing "tailor" (counted in full) plus expenses filed under a category
 *  containing "salar" that are linked, via the expense's Customer Link mobile number, to an
 *  employee whose role contains "tailor" — plus any Payroll payslip paid to a tailor. Profit is
 *  Billed (accrual) minus that cost, not Collected minus cost. */
export default function MonthlyPnlPage() {
  const { orders, isLoading } = useReportsData();
  const { data: expenses, isLoading: expensesLoading } = useExpenses();
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: payslips, isLoading: payslipsLoading } = useAllPayslips();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const monthly = useMemo(
    () =>
      getStitchingPnl(
        orders.filter((o) => isWithinDateRange(o.inDate, range)),
        (expenses || []).filter((e) => isWithinDateRange(e.date, range)),
        employees || [],
        (payslips || []).filter((p) => isWithinDateRange(p.paidAt, range))
      ),
    [orders, expenses, employees, payslips, range]
  );
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<MonthlyRow>("reports-monthly", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedMonthly = applySort(monthly);

  if (isLoading || expensesLoading || employeesLoading || payslipsLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-80 w-full" /></div>;

  const totals = monthly.reduce(
    (acc, m) => ({
      count: acc.count + m.count,
      billed: acc.billed + m.billed,
      collected: acc.collected + m.collected,
      pending: acc.pending + m.pending,
      tailoringExpense: acc.tailoringExpense + m.tailoringExpense,
      tailorSalaryExpense: acc.tailorSalaryExpense + m.tailorSalaryExpense,
      tailorPayrollCost: acc.tailorPayrollCost + m.tailorPayrollCost,
      netProfit: acc.netProfit + m.netProfit,
    }),
    { count: 0, billed: 0, collected: 0, pending: 0, tailoringExpense: 0, tailorSalaryExpense: 0, tailorPayrollCost: 0, netProfit: 0 }
  );

  return (
    <ReportShell
      title="Stitching Monthly P&L"
      description="Stitching orders only — billed revenue minus tailor costs (Tailoring-category expenses, tailor-linked Salaries expenses, and tailor payroll) over the last 6 months. For both revenue streams combined, see Combined P&L."
      actions={
        <ReportActionsMenu
          rows={sortedMonthly.map((m) => ({
            Month: m.label,
            Orders: m.count,
            Billed: m.billed,
            Collected: m.collected,
            Pending: m.pending,
            "Tailoring Expense": m.tailoringExpense,
            "Salary Paid to Tailor": m.tailorSalaryExpense,
            "Tailor Payroll": m.tailorPayrollCost,
            "Net Profit": m.netProfit,
          }))}
          filename="stitching-monthly-pl"
          title="Stitching Monthly P&L"
          summaryLines={[
            `Total billed: ${inr(totals.billed)}`,
            `Total collected: ${inr(totals.collected)}`,
            `Total tailoring expense: ${inr(totals.tailoringExpense)}`,
            `Total salary paid to tailor: ${inr(totals.tailorSalaryExpense)}`,
            `Total tailor payroll: ${inr(totals.tailorPayrollCost)}`,
            `Net profit: ${inr(totals.netProfit)}`,
          ]}
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
      />

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
              <Area type="monotone" dataKey="netProfit" name="Net Profit" stroke="#7c3aed" strokeWidth={2} fill="#7c3aed" fillOpacity={0.1} />
              <Area type="monotone" dataKey="tailoringExpense" name="Tailoring Expense" stroke="#ef4444" strokeWidth={2} fill="#ef4444" fillOpacity={0.08} />
              <Area type="monotone" dataKey="tailorSalaryExpense" name="Salary Paid to Tailor" stroke="#f97316" strokeWidth={2} fill="#f97316" fillOpacity={0.08} />
              <Area type="monotone" dataKey="tailorPayrollCost" name="Tailor Payroll" stroke="#d946ef" strokeWidth={2} fill="#d946ef" fillOpacity={0.08} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <MobileRecordList>
        <MobileRecordCard className="bg-muted/40">
          <MobileRecordHeader title="Total" value={inr(totals.netProfit)} showChevron={false} />
          <MobileRecordRow label="Orders" value={totals.count} />
          <MobileRecordRow label="Billed" value={inr(totals.billed)} />
          <MobileRecordRow label="Collected" value={inr(totals.collected)} valueClassName="text-emerald-600 dark:text-emerald-400" />
          <MobileRecordRow label="Pending" value={inr(totals.pending)} />
          <MobileRecordRow label="Tailoring Expense" value={inr(totals.tailoringExpense)} valueClassName="text-red-600 dark:text-red-400" />
          <MobileRecordRow label="Salary Paid to Tailor" value={inr(totals.tailorSalaryExpense)} valueClassName="text-red-600 dark:text-red-400" />
          <MobileRecordRow label="Tailor Payroll" value={inr(totals.tailorPayrollCost)} valueClassName="text-red-600 dark:text-red-400" />
          <MobileRecordRow label="Net Profit" value={inr(totals.netProfit)} valueClassName={totals.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
        </MobileRecordCard>
        {sortedMonthly.map((m) => (
          <MobileRecordCard key={m.month}>
            <MobileRecordHeader title={m.label} value={inr(m.netProfit)} showChevron={false} />
            <MobileRecordRow label="Orders" value={m.count} />
            <MobileRecordRow label="Billed" value={inr(m.billed)} />
            <MobileRecordRow label="Collected" value={inr(m.collected)} valueClassName="text-emerald-600 dark:text-emerald-400" />
            <MobileRecordRow label="Pending" value={m.pending > 0 ? <BalanceDue amount={m.pending} /> : "—"} />
            <MobileRecordRow label="Tailoring Expense" value={inr(m.tailoringExpense)} valueClassName="text-red-600 dark:text-red-400" />
            <MobileRecordRow label="Salary Paid to Tailor" value={inr(m.tailorSalaryExpense)} valueClassName="text-red-600 dark:text-red-400" />
            <MobileRecordRow label="Tailor Payroll" value={inr(m.tailorPayrollCost)} valueClassName="text-red-600 dark:text-red-400" />
            <MobileRecordRow label="Net Profit" value={inr(m.netProfit)} valueClassName={m.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
          </MobileRecordCard>
        ))}
      </MobileRecordList>
      <div className="hidden sm:block">
      <ReportTable>
        <thead className="border-b bg-muted/40">
          <tr>
            <Th sortKey="month" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Month</Th>
            <Th align="right" sortKey="count" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Orders</Th>
            <Th align="right" sortKey="billed" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Billed</Th>
            <Th align="right" sortKey="collected" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Collected</Th>
            <Th align="right" sortKey="pending" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Pending</Th>
            <Th align="right" sortKey="tailoringExpense" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Tailoring Expense</Th>
            <Th align="right" sortKey="tailorSalaryExpense" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Salary Paid to Tailor</Th>
            <Th align="right" sortKey="tailorPayrollCost" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Tailor Payroll</Th>
            <Th align="right" sortKey="netProfit" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Net Profit</Th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <ReportTotalsRow>
            <Td>Total</Td>
            <Td align="right">{totals.count}</Td>
            <Td align="right">{inr(totals.billed)}</Td>
            <Td align="right">{inr(totals.collected)}</Td>
            <Td align="right">{inr(totals.pending)}</Td>
            <Td align="right" className="text-red-600 dark:text-red-400">{inr(totals.tailoringExpense)}</Td>
            <Td align="right" className="text-red-600 dark:text-red-400">{inr(totals.tailorSalaryExpense)}</Td>
            <Td align="right" className="text-red-600 dark:text-red-400">{inr(totals.tailorPayrollCost)}</Td>
            <Td align="right" className={totals.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{inr(totals.netProfit)}</Td>
          </ReportTotalsRow>
          {sortedMonthly.map((m) => (
            <tr key={m.month} className="hover:bg-muted/30">
              <Td className="font-medium">{m.label}</Td>
              <Td align="right">{m.count}</Td>
              <Td align="right">{inr(m.billed)}</Td>
              <Td align="right" className="text-emerald-600 dark:text-emerald-400">
                {inr(m.collected)}
              </Td>
              <Td align="right">{m.pending > 0 ? <BalanceDue amount={m.pending} /> : "—"}</Td>
              <Td align="right" className="text-red-600 dark:text-red-400">{inr(m.tailoringExpense)}</Td>
              <Td align="right" className="text-red-600 dark:text-red-400">{inr(m.tailorSalaryExpense)}</Td>
              <Td align="right" className="text-red-600 dark:text-red-400">{inr(m.tailorPayrollCost)}</Td>
              <Td align="right" className={m.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{inr(m.netProfit)}</Td>
            </tr>
          ))}
        </tbody>
      </ReportTable>
      </div>
    </ReportShell>
  );
}
