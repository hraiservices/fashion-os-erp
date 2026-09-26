"use client";

import { useMemo, useState } from "react";
import { UserCog } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useOrders } from "@/hooks/use-orders";
import { computeCommission } from "@/lib/commission";
import { inr } from "@/lib/format";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";
import type { Employee } from "@/lib/types";

type CommissionRow = { employee: Employee; attributedOrders: number; attributedValue: number; commission: number };

const SORT_COMPARATORS: Record<string, (a: CommissionRow, b: CommissionRow) => number> = {
  employee: (a, b) => a.employee.name.localeCompare(b.employee.name),
  orders: (a, b) => a.attributedOrders - b.attributedOrders,
  value: (a, b) => a.attributedValue - b.attributedValue,
  commission: (a, b) => a.commission - b.commission,
};
const SORT_DESC_KEYS = new Set(["orders", "value", "commission"]);

export default function EmployeeCommissionReportPage() {
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const isLoading = employeesLoading || ordersLoading;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();
  const [employeeFilter, setEmployeeFilter] = useState("all");

  const filteredOrders = useMemo(() => (orders || []).filter((o) => isWithinDateRange(o.inDate, range)), [orders, range]);

  const commissionEmployees = useMemo(() => (employees || []).filter((e) => e.commissionType !== "none"), [employees]);
  const employeeNames = useMemo(() => Array.from(new Set(commissionEmployees.map((e) => e.name))).sort(), [commissionEmployees]);

  const rows = useMemo(() => {
    return commissionEmployees
      .filter((e) => employeeFilter === "all" || e.name === employeeFilter)
      .map((e) => ({ employee: e, ...computeCommission(e, filteredOrders) }))
      .sort((a, b) => b.commission - a.commission);
  }, [commissionEmployees, filteredOrders, employeeFilter]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<CommissionRow>("employee-commission", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Employee Commission"
      description="All-time attributed orders and commission per employee — matched by tailor name"
      actions={
        <ReportActionsMenu
          rows={sortedRows.map((r) => ({ Employee: r.employee.name, Orders: r.attributedOrders, "Attributed Value": r.attributedValue, Commission: r.commission }))}
          filename="employee-commission"
          title="Employee Commission"
          summaryLines={[`Employees: ${rows.length}`, `Total commission: ${inr(rows.reduce((s, r) => s + r.commission, 0))}`]}
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
          <Select value={employeeFilter} onValueChange={(v) => v && setEmployeeFilter(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{employeeFilter === "all" ? "All Employees" : employeeFilter}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employeeNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={UserCog} title="No commission-eligible employees" description="Set a commission type on an employee in Employees to see them here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="employee" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Employee</Th>
                  <Th align="right" sortKey="orders" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Orders</Th>
                  <Th align="right" sortKey="value" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Attributed Value</Th>
                  <Th align="right" sortKey="commission" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Commission</Th>
                </tr>
              </thead>
              <tbody>
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{rows.reduce((s, r) => s + r.attributedOrders, 0)}</Td>
                  <Td align="right">{inr(rows.reduce((s, r) => s + r.attributedValue, 0))}</Td>
                  <Td align="right">{inr(rows.reduce((s, r) => s + r.commission, 0))}</Td>
                </ReportTotalsRow>
                {sortedRows.map((r) => (
                  <tr key={r.employee.id} className="border-b last:border-0">
                    <Td>{r.employee.name}</Td>
                    <Td align="right">{r.attributedOrders}</Td>
                    <Td align="right">{inr(r.attributedValue)}</Td>
                    <Td align="right">{inr(r.commission)}</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={inr(rows.reduce((s, r) => s + r.commission, 0))} showChevron={false} />
              <MobileRecordRow label="Orders" value={rows.reduce((s, r) => s + r.attributedOrders, 0)} />
              <MobileRecordRow label="Attributed Value" value={inr(rows.reduce((s, r) => s + r.attributedValue, 0))} />
            </MobileRecordCard>
            {sortedRows.map((r) => (
              <MobileRecordCard key={r.employee.id}>
                <MobileRecordHeader title={r.employee.name} value={inr(r.commission)} showChevron={false} />
                <MobileRecordRow label="Orders" value={r.attributedOrders} />
                <MobileRecordRow label="Attributed Value" value={inr(r.attributedValue)} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
