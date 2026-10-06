"use client";

import { useMemo } from "react";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useExpenses } from "@/hooks/use-expenses";
import { useEmployees } from "@/hooks/use-employees";
import { useAllPayslips } from "@/hooks/use-payroll";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getSalesPnl, type SalesPnlStat } from "@/lib/combined-reports";
import { inr } from "@/lib/format";
import { ReportShell, ReportCard, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet } from "lucide-react";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";

const SORT_COMPARATORS: Record<string, (a: SalesPnlStat, b: SalesPnlStat) => number> = {
  month: (a, b) => a.label.localeCompare(b.label),
  count: (a, b) => a.count - b.count,
  billed: (a, b) => a.billed - b.billed,
  purchaseCost: (a, b) => a.purchaseCost - b.purchaseCost,
  salesStaffCost: (a, b) => a.salesStaffCost - b.salesStaffCost,
  netProfit: (a, b) => a.netProfit - b.netProfit,
};
const SORT_DESC_KEYS = new Set(["count", "billed", "purchaseCost", "salesStaffCost", "netProfit"]);

/** Product sales (invoices) only — billed revenue minus purchases/COGS and Sales Staff cost
 *  (Salaries-category expenses linked to a sales-role employee, plus their Payroll payslips).
 *  Deliberately never touches tailor cost — see Stitching Monthly P&L for that. Commission is
 *  not yet included: sales invoices have no field recording which Sales Person made the sale
 *  (see getSalesPnl in combined-reports.ts) — planned once that field exists. */
export default function SalesPnlPage() {
  const { data: user } = useCurrentUser();
  const { data: invoices, isLoading: invoicesLoading } = useSalesInvoices();
  const { data: bills, isLoading: billsLoading } = usePurchaseBills();
  const { data: expenses, isLoading: expensesLoading } = useExpenses();
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: payslips, isLoading: payslipsLoading } = useAllPayslips();
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const monthly = useMemo(
    () =>
      getSalesPnl(
        (invoices || []).filter((i) => isWithinDateRange(i.invoiceDate, range)),
        (bills || []).filter((b) => isWithinDateRange(b.billDate, range)),
        (expenses || []).filter((e) => isWithinDateRange(e.date, range)),
        employees || [],
        (payslips || []).filter((p) => isWithinDateRange(p.paidAt, range))
      ),
    [invoices, bills, expenses, employees, payslips, range]
  );
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<SalesPnlStat>("reports-sales-pl", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedMonthly = applySort(monthly);

  const isLoading = invoicesLoading || billsLoading || expensesLoading || employeesLoading || payslipsLoading;

  // Profit & Loss is entirely profit data — restricted to admin, same as Combined P&L.
  if (user && !user.perms.viewFinancialReports) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={Wallet} title="No access" description="Product Sales P&L is restricted to admins." />
      </div>
    );
  }

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-80 w-full" /></div>;

  const totals = monthly.reduce(
    (acc, m) => ({
      count: acc.count + m.count,
      billed: acc.billed + m.billed,
      purchaseCost: acc.purchaseCost + m.purchaseCost,
      salesStaffCost: acc.salesStaffCost + m.salesStaffCost,
      netProfit: acc.netProfit + m.netProfit,
    }),
    { count: 0, billed: 0, purchaseCost: 0, salesStaffCost: 0, netProfit: 0 }
  );

  return (
    <ReportShell
      title="Product Sales P&L"
      description="Product sales (invoices) only — billed revenue minus purchases/COGS and Sales Staff cost (Salaries expenses and payroll linked to sales-role employees). Never includes tailor cost — see Stitching Monthly P&L for that. For both revenue streams combined, see Combined P&L."
      actions={
        <ReportActionsMenu
          rows={sortedMonthly.map((m) => ({
            Month: m.label,
            Invoices: m.count,
            Billed: m.billed,
            "Purchases/COGS": m.purchaseCost,
            "Sales Staff Cost": m.salesStaffCost,
            "Net Profit": m.netProfit,
          }))}
          filename="product-sales-pl"
          title="Product Sales P&L"
          summaryLines={[
            `Total billed: ${inr(totals.billed)}`,
            `Total purchases/COGS: ${inr(totals.purchaseCost)}`,
            `Total sales staff cost: ${inr(totals.salesStaffCost)}`,
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
              <Area type="monotone" dataKey="totalCost" name="Cost" stroke="#ef4444" strokeWidth={2} fill="#ef4444" fillOpacity={0.1} />
              <Area type="monotone" dataKey="netProfit" name="Net Profit" stroke="#059669" strokeWidth={2} fill="#059669" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ReportCard>

      <MobileRecordList>
        <MobileRecordCard className="bg-muted/40">
          <MobileRecordHeader boldTitle title="Total" value={inr(totals.netProfit)} showChevron={false} valueClassName="text-emerald-600 dark:text-emerald-400" />
          <MobileRecordRow label="Invoices" value={totals.count} />
          <MobileRecordRow label="Billed" value={inr(totals.billed)} />
          <MobileRecordRow label="Purchases/COGS" value={inr(totals.purchaseCost)} valueClassName="text-red-600 dark:text-red-400" />
          <MobileRecordRow label="Sales Staff Cost" value={inr(totals.salesStaffCost)} valueClassName="text-red-600 dark:text-red-400" />
          <MobileRecordRow label="Net Profit" value={inr(totals.netProfit)} valueClassName={totals.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
        </MobileRecordCard>
        {sortedMonthly.map((m) => (
          <MobileRecordCard key={m.month}>
            <MobileRecordHeader boldTitle title={m.label} value={inr(m.netProfit)} showChevron={false} valueClassName="text-emerald-600 dark:text-emerald-400" />
            <MobileRecordRow label="Invoices" value={m.count} />
            <MobileRecordRow label="Billed" value={inr(m.billed)} />
            <MobileRecordRow label="Purchases/COGS" value={inr(m.purchaseCost)} valueClassName="text-red-600 dark:text-red-400" />
            <MobileRecordRow label="Sales Staff Cost" value={inr(m.salesStaffCost)} valueClassName="text-red-600 dark:text-red-400" />
            <MobileRecordRow label="Net Profit" value={inr(m.netProfit)} valueClassName={m.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} />
          </MobileRecordCard>
        ))}
      </MobileRecordList>
      <div className="hidden sm:block">
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th sortKey="month" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Month</Th>
              <Th align="right" sortKey="count" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Invoices</Th>
              <Th align="right" sortKey="billed" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Billed</Th>
              <Th align="right" sortKey="purchaseCost" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Purchases/COGS</Th>
              <Th align="right" sortKey="salesStaffCost" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Sales Staff Cost</Th>
              <Th align="right" sortKey="netProfit" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Net Profit</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <ReportTotalsRow>
              <Td>Total</Td>
              <Td align="right">{totals.count}</Td>
              <Td align="right">{inr(totals.billed)}</Td>
              <Td align="right" className="text-red-600 dark:text-red-400">{inr(totals.purchaseCost)}</Td>
              <Td align="right" className="text-red-600 dark:text-red-400">{inr(totals.salesStaffCost)}</Td>
              <Td align="right" className={totals.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{inr(totals.netProfit)}</Td>
            </ReportTotalsRow>
            {sortedMonthly.map((m) => (
              <tr key={m.month} className="hover:bg-muted/30">
                <Td className="font-medium">{m.label}</Td>
                <Td align="right">{m.count}</Td>
                <Td align="right">{inr(m.billed)}</Td>
                <Td align="right" className="text-red-600 dark:text-red-400">{inr(m.purchaseCost)}</Td>
                <Td align="right" className="text-red-600 dark:text-red-400">{inr(m.salesStaffCost)}</Td>
                <Td align="right" className={m.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{inr(m.netProfit)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      </div>
    </ReportShell>
  );
}
