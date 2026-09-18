"use client";

import { FileDown, Wallet } from "lucide-react";
import { useMyPayslips } from "@/hooks/use-payroll";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

/** Self-service: a staff login's own salary slips, scoped server-side to their linked employee
 *  record — see /api/payroll/my-payslips. Not gated on managePayroll (that's for administering
 *  everyone else's payroll); this is just "my own data". */
export default function MyPayslipsPage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data, isLoading } = useMyPayslips();

  if (userLoading || isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user?.employeeId) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={Wallet} title="No employee record linked" description="Your login isn't linked to a staff record, so there are no payslips to show here. Ask an admin to link your account." />
      </div>
    );
  }

  const runById = new Map((data?.runs || []).map((r) => [r.id, r]));
  const payslips = data?.payslips || [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My Payslips" description="Your salary history" />

      {payslips.length === 0 ? (
        <EmptyState icon={Wallet} title="No payslips yet" description="Payslips appear here once payroll has been run for a period that includes you." />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((p) => {
                  const run = runById.get(p.payrollRunId);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{run ? `${fmtDate(run.periodStart)} – ${fmtDate(run.periodEnd)}` : "—"}</TableCell>
                      <TableCell className="text-right">{inr(p.grossPay)}</TableCell>
                      <TableCell className="text-right font-semibold">{inr(p.netPay)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={p.status === "paid" ? "secondary" : "outline"}>{p.status === "paid" ? "Paid" : "Draft"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-11 sm:size-7"
                          aria-label="Download payslip"
                          title="Download payslip"
                          nativeButton={false}
                          render={<a href={`/api/employees/payslips/${p.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
                        >
                          <FileDown className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <MobileRecordList className="p-2">
            {payslips.map((p) => {
              const run = runById.get(p.payrollRunId);
              return (
                <MobileRecordCard key={p.id}>
                  <MobileRecordHeader title={run ? `${fmtDate(run.periodStart)} – ${fmtDate(run.periodEnd)}` : "—"} value={inr(p.netPay)} showChevron={false} />
                  <MobileRecordRow label="Gross" value={inr(p.grossPay)} />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <Badge variant={p.status === "paid" ? "secondary" : "outline"}>{p.status === "paid" ? "Paid" : "Draft"}</Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full gap-1.5"
                    nativeButton={false}
                    render={<a href={`/api/employees/payslips/${p.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
                  >
                    <FileDown className="size-3.5" /> Download Payslip
                  </Button>
                </MobileRecordCard>
              );
            })}
          </MobileRecordList>
        </div>
      )}
    </div>
  );
}
