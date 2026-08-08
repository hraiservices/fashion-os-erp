"use client";

import { useMemo } from "react";
import { Printer, UserCog } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useOrders } from "@/hooks/use-orders";
import { computeCommission } from "@/lib/commission";
import { printReport } from "@/lib/export";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function EmployeeCommissionReportPage() {
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const isLoading = employeesLoading || ordersLoading;

  const rows = useMemo(() => {
    return (employees || [])
      .filter((e) => e.commissionType !== "none")
      .map((e) => ({ employee: e, ...computeCommission(e, orders || []) }))
      .sort((a, b) => b.commission - a.commission);
  }, [employees, orders]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Employee Commission"
      description="All-time attributed orders and commission per employee — matched by tailor name"
      actions={
        rows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              printReport(
                "Employee Commission",
                `<table><thead><tr><th>Employee</th><th>Orders</th><th>Attributed Value</th><th>Commission</th></tr></thead><tbody>${rows
                  .map((r) => `<tr><td>${r.employee.name}</td><td>${r.attributedOrders}</td><td>${inr(r.attributedValue)}</td><td>${inr(r.commission)}</td></tr>`)
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
        <EmptyState icon={UserCog} title="No commission-eligible employees" description="Set a commission type on an employee in Employees to see them here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Employee</Th>
              <Th align="right">Orders</Th>
              <Th align="right">Attributed Value</Th>
              <Th align="right">Commission</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee.id} className="border-b last:border-0">
                <Td>{r.employee.name}</Td>
                <Td align="right">{r.attributedOrders}</Td>
                <Td align="right">{inr(r.attributedValue)}</Td>
                <Td align="right">{inr(r.commission)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
