"use client";

import { useMemo, useState } from "react";
import { Wallet, FileDown } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { usePayrollRuns, useAllPayslips } from "@/hooks/use-payroll";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordGrid } from "@/components/ui/mobile-record-list";
import { ColumnCustomizerMenu } from "@/components/ui/column-customizer";
import { useColumnVisibility } from "@/hooks/use-column-visibility";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTableSort } from "@/hooks/use-table-sort";

type PayrollRow = { payslip: import("@/lib/types").Payslip; run: import("@/lib/types").PayrollRun | undefined };

const PAYROLL_SUMMARY_COLUMNS = [
  { key: "period", label: "Period", required: true },
  { key: "employee", label: "Employee", required: true },
  { key: "gross", label: "Gross" },
  { key: "overtime", label: "Overtime" },
  { key: "deductions", label: "Deductions" },
  { key: "netPay", label: "Net Pay", required: true },
  { key: "status", label: "Status" },
  { key: "download", label: "Download" },
];

// Below 1920px (a 14" laptop) the full 8-column table feels cramped — Overtime is the widest
// cell ("Xh · ₹Y") and the least essential to have visible at a glance, so it defaults to hidden
// there and reappears automatically on a wider monitor (still one click away via Columns).
const PAYROLL_SUMMARY_AUTO_HIDE = { belowWidth: 1920, keys: ["overtime"] };

/** Salary/payroll report — every payslip ever generated, across all runs, with employee + period joined in client-side. Admin-only (managePayroll), same as the Payroll pages themselves.
 *  Each payslip covers a pay period rather than a single date — the date range matches it against
 *  the run's periodStart. */
export default function PayrollSummaryReportPage() {
  const { data: user } = useCurrentUser();
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: runs, isLoading: runsLoading } = usePayrollRuns();
  const { data: payslips, isLoading: payslipsLoading } = useAllPayslips();
  const canManagePayroll = !!user?.perms.managePayroll;
  const isLoading = employeesLoading || runsLoading || payslipsLoading;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const columnTable = useColumnVisibility("payroll-summary", PAYROLL_SUMMARY_COLUMNS, PAYROLL_SUMMARY_AUTO_HIDE);
  const isVisible = columnTable.isVisible;
  const [role, setRole] = useState("all");

  const employeeName = (id: string) => (employees || []).find((e) => e.id === id)?.name || "—";
  const employeeById = useMemo(() => new Map((employees || []).map((e) => [e.id, e])), [employees]);
  const runById = useMemo(() => new Map((runs || []).map((r) => [r.id, r])), [runs]);

  const roles = useMemo(() => {
    const set = new Set((employees || []).map((e) => e.role).filter(Boolean));
    return Array.from(set).sort();
  }, [employees]);

  const rows = useMemo(() => {
    return (payslips || [])
      .map((p) => ({ payslip: p, run: runById.get(p.payrollRunId) }))
      .filter((r) => r.run && isWithinDateRange(r.run.periodStart, range))
      .filter((r) => role === "all" || employeeById.get(r.payslip.employeeId)?.role === role)
      .sort((a, b) => (b.run!.periodStart || "").localeCompare(a.run!.periodStart || ""));
  }, [payslips, runById, range, role, employeeById]);

  const totals = rows.reduce(
    (acc, r) => ({ gross: acc.gross + r.payslip.grossPay, deductions: acc.deductions + r.payslip.deductions, net: acc.net + r.payslip.netPay }),
    { gross: 0, deductions: 0, net: 0 }
  );

  const sortComparators: Record<string, (a: PayrollRow, b: PayrollRow) => number> = {
    period: (a, b) => (a.run?.periodStart || "").localeCompare(b.run?.periodStart || ""),
    employee: (a, b) => employeeName(a.payslip.employeeId).localeCompare(employeeName(b.payslip.employeeId)),
    gross: (a, b) => a.payslip.grossPay - b.payslip.grossPay,
    overtime: (a, b) => a.payslip.overtimePay - b.payslip.overtimePay,
    deductions: (a, b) => a.payslip.deductions - b.payslip.deductions,
    netPay: (a, b) => a.payslip.netPay - b.payslip.netPay,
    status: (a, b) => a.payslip.status.localeCompare(b.payslip.status),
  };
  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<PayrollRow>(
    "payroll-summary",
    sortComparators,
    new Set(["gross", "overtime", "deductions", "netPay"])
  );
  const sortedRows = applySort(rows);

  if (!canManagePayroll) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={Wallet} title="No access" description="Payroll reports are restricted to admins." />
      </div>
    );
  }

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Salary Report"
      description={`${rows.length} payslips across ${runs?.length || 0} payroll runs · Total net paid ${inr(totals.net)}`}
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((r) => ({
            Period: `${fmtDate(r.run!.periodStart)} – ${fmtDate(r.run!.periodEnd)}`,
            Employee: employeeName(r.payslip.employeeId),
            Gross: r.payslip.grossPay,
            Deductions: r.payslip.deductions,
            "Net Pay": r.payslip.netPay,
            Status: r.payslip.status,
          }))}
          filename="salary-report"
          title="Salary Report"
          summaryLines={[`Payslips: ${rows.length}`, `Total net paid: ${inr(totals.net)}`]}
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
        category={
          <Select value={role} onValueChange={(v) => v && setRole(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{role === "all" ? "All Roles" : role}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No payslips yet" description="Run payroll from Employees → Payroll to see salary history here." />
      ) : (
        <>
          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(totals.net)} showChevron={false} />
              <MobileRecordGrid
                items={[
                  { label: "Gross", value: inr(totals.gross) },
                  { label: "Deductions", value: inr(totals.deductions) },
                ]}
              />
            </MobileRecordCard>
            {sortedRows.map((r) => (
              <MobileRecordCard key={r.payslip.id}>
                <MobileRecordHeader
                  title={employeeName(r.payslip.employeeId)}
                  subtitle={`${fmtDate(r.run!.periodStart)} – ${fmtDate(r.run!.periodEnd)}`}
                  value={inr(r.payslip.netPay)}
                  showChevron={false}
                />
                <MobileRecordGrid
                  items={[
                    { label: "Gross", value: inr(r.payslip.grossPay) },
                    { label: "Overtime", value: r.payslip.overtimeHours > 0 ? `${r.payslip.overtimeHours}h · ${inr(r.payslip.overtimePay)}` : "—" },
                    { label: "Deductions", value: r.payslip.deductions > 0 ? `− ${inr(r.payslip.deductions)}` : "—" },
                    { label: "Status", value: <Badge variant={r.payslip.status === "paid" ? "secondary" : "outline"}>{r.payslip.status === "paid" ? "Paid" : "Draft"}</Badge> },
                  ]}
                />
                <div className="flex justify-end border-t pt-1.5">
                  <a href={`/api/employees/payslips/${r.payslip.id}/pdf`} target="_blank" rel="noopener noreferrer" aria-label="Download payslip" title="Download payslip" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <FileDown className="size-3.5" /> Download
                  </a>
                </div>
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <div className="hidden justify-end sm:flex">
            <ColumnCustomizerMenu table={columnTable} />
          </div>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="period" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Period</Th>
                  <Th sortKey="employee" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Employee</Th>
                  <Th align="right" sortKey="gross" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Gross</Th>
                  {isVisible("overtime") && <Th align="right" sortKey="overtime" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Overtime</Th>}
                  <Th align="right" sortKey="deductions" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Deductions</Th>
                  <Th align="right" sortKey="netPay" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Net Pay</Th>
                  <Th align="right" sortKey="status" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                <ReportTotalsRow>
                  <Td colSpan={2}>Total</Td>
                  <Td align="right">{inr(totals.gross)}</Td>
                  {isVisible("overtime") && <Td align="right">—</Td>}
                  <Td align="right">{inr(totals.deductions)}</Td>
                  <Td align="right">{inr(totals.net)}</Td>
                  <Td align="right">—</Td>
                  <Td />
                </ReportTotalsRow>
                {sortedRows.map((r) => (
                  <tr key={r.payslip.id} className="border-b last:border-0">
                    <Td>
                      {fmtDate(r.run!.periodStart)} – {fmtDate(r.run!.periodEnd)}
                    </Td>
                    <Td>{employeeName(r.payslip.employeeId)}</Td>
                    <Td align="right">{inr(r.payslip.grossPay)}</Td>
                    {isVisible("overtime") && (
                      <Td align="right">{r.payslip.overtimeHours > 0 ? `${r.payslip.overtimeHours}h · ${inr(r.payslip.overtimePay)}` : "—"}</Td>
                    )}
                    <Td align="right">{r.payslip.deductions > 0 ? `− ${inr(r.payslip.deductions)}` : "—"}</Td>
                    <Td align="right" className="font-semibold">
                      {inr(r.payslip.netPay)}
                    </Td>
                    <Td align="right">
                      <Badge variant={r.payslip.status === "paid" ? "secondary" : "outline"}>{r.payslip.status === "paid" ? "Paid" : "Draft"}</Badge>
                    </Td>
                    <Td>
                      <a href={`/api/employees/payslips/${r.payslip.id}/pdf`} target="_blank" rel="noopener noreferrer" aria-label="Download payslip" title="Download payslip" className="inline-flex text-muted-foreground hover:text-foreground">
                        <FileDown className="size-3.5" />
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
        </>
      )}
    </ReportShell>
  );
}
