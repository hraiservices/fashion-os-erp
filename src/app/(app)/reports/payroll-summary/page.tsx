"use client";

import { useMemo } from "react";
import { Printer, Wallet, FileDown } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { usePayrollRuns, useAllPayslips } from "@/hooks/use-payroll";
import { useCurrentUser } from "@/hooks/use-current-user";
import { printReport } from "@/lib/export";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/** Salary/payroll report — every payslip ever generated, across all runs, with employee + period joined in client-side. Admin-only (managePayroll), same as the Payroll pages themselves. */
export default function PayrollSummaryReportPage() {
  const { data: user } = useCurrentUser();
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: runs, isLoading: runsLoading } = usePayrollRuns();
  const { data: payslips, isLoading: payslipsLoading } = useAllPayslips();
  const canManagePayroll = !!user?.perms.managePayroll;
  const isLoading = employeesLoading || runsLoading || payslipsLoading;

  const employeeName = (id: string) => (employees || []).find((e) => e.id === id)?.name || "—";
  const runById = useMemo(() => new Map((runs || []).map((r) => [r.id, r])), [runs]);

  const rows = useMemo(() => {
    return (payslips || [])
      .map((p) => ({ payslip: p, run: runById.get(p.payrollRunId) }))
      .filter((r) => r.run)
      .sort((a, b) => (b.run!.periodStart || "").localeCompare(a.run!.periodStart || ""));
  }, [payslips, runById]);

  const totals = rows.reduce(
    (acc, r) => ({ gross: acc.gross + r.payslip.grossPay, deductions: acc.deductions + r.payslip.deductions, net: acc.net + r.payslip.netPay }),
    { gross: 0, deductions: 0, net: 0 }
  );

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
        rows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              printReport(
                "Salary Report",
                `<table><thead><tr><th>Period</th><th>Employee</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th></tr></thead><tbody>${rows
                  .map(
                    (r) =>
                      `<tr><td>${fmtDate(r.run!.periodStart)} – ${fmtDate(r.run!.periodEnd)}</td><td>${employeeName(r.payslip.employeeId)}</td><td>${inr(r.payslip.grossPay)}</td><td>${inr(r.payslip.deductions)}</td><td>${inr(r.payslip.netPay)}</td><td>${r.payslip.status}</td></tr>`
                  )
                  .join("")}</tbody></table>`
              )
            }
          >
            <Printer className="size-4" /> Print
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No payslips yet" description="Run payroll from Employees → Payroll to see salary history here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Period</Th>
              <Th>Employee</Th>
              <Th align="right">Gross</Th>
              <Th align="right">Overtime</Th>
              <Th align="right">Deductions</Th>
              <Th align="right">Net Pay</Th>
              <Th align="right">Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.payslip.id} className="border-b last:border-0">
                <Td>
                  {fmtDate(r.run!.periodStart)} – {fmtDate(r.run!.periodEnd)}
                </Td>
                <Td>{employeeName(r.payslip.employeeId)}</Td>
                <Td align="right">{inr(r.payslip.grossPay)}</Td>
                <Td align="right">{r.payslip.overtimeHours > 0 ? `${r.payslip.overtimeHours}h · ${inr(r.payslip.overtimePay)}` : "—"}</Td>
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
      )}
    </ReportShell>
  );
}
