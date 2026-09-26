"use client";

import { useMemo, useState } from "react";
import { UserCog } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { fmtDate, inr } from "@/lib/format";
import { SALARY_TYPE_LABELS } from "@/lib/payroll";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";
import { useTableSort } from "@/hooks/use-table-sort";
import type { Employee } from "@/lib/types";

const SORT_COMPARATORS: Record<string, (a: Employee, b: Employee) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  role: (a, b) => (a.role || "").localeCompare(b.role || ""),
  mobile: (a, b) => (a.mobile || "").localeCompare(b.mobile || ""),
  employment: (a, b) => a.employmentType.localeCompare(b.employmentType),
  joined: (a, b) => (a.joinedDate || "").localeCompare(b.joinedDate || ""),
  status: (a, b) => Number(a.active) - Number(b.active),
};
const SORT_DESC_KEYS = new Set(["joined"]);

/** A pure roster, not a transaction log — the date range filters by joinedDate, so it reads as
 *  "who joined in this window" rather than "activity in this window" like other reports. */
export default function EmployeeDirectoryReportPage() {
  const { data: employees, isLoading } = useEmployees();
  const { data: user } = useCurrentUser();
  const [showInactive, setShowInactive] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const canSeeSalary = !!user?.perms.managePayroll;
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const roles = useMemo(() => Array.from(new Set((employees || []).map((e) => e.role).filter(Boolean))).sort(), [employees]);

  const rows = useMemo(() => {
    return (employees || [])
      .filter((e) => showInactive || e.active)
      .filter((e) => roleFilter === "all" || e.role === roleFilter)
      .filter((e) => isWithinDateRange(e.joinedDate, range))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, showInactive, roleFilter, range]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<Employee>("employee-directory", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Employee Directory"
      description="Full roster — role, contact, employment details"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide inactive" : "Show inactive"}
          </Button>
          <ReportActionsMenu
            rows={sortedRows.map((e) => ({
              Name: e.name,
              Role: e.role || "—",
              Mobile: e.mobile || "—",
              Employment: e.employmentType,
              Joined: e.joinedDate ? fmtDate(e.joinedDate) : "—",
              Status: e.active ? "Active" : "Inactive",
            }))}
            filename="employee-directory"
            title="Employee Directory"
            summaryLines={[`Employees: ${rows.length}`, `Active: ${rows.filter((e) => e.active).length}`]}
          />
        </>
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
          <Select value={roleFilter} onValueChange={(v) => v && setRoleFilter(v)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{roleFilter === "all" ? "All Roles" : roleFilter}</SelectValue>
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
        <EmptyState icon={UserCog} title="No employees yet" description="Add employees in Employees to see them here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="name" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Name</Th>
                  <Th sortKey="role" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Role</Th>
                  <Th sortKey="mobile" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Mobile</Th>
                  <Th sortKey="employment" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Employment</Th>
                  <Th sortKey="joined" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Joined</Th>
                  {canSeeSalary && <Th align="right">Salary</Th>}
                  <Th align="right" sortKey="status" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Status</Th>
                </tr>
              </thead>
              <tbody>
                <ReportTotalsRow>
                  <Td colSpan={canSeeSalary ? 5 : 4}>Total</Td>
                  {/* Salary rates mix monthly/daily/hourly units — summing them would produce a
                      meaningless figure, so this column stays blank in the totals row. */}
                  {canSeeSalary && <Td align="right">—</Td>}
                  <Td align="right">{rows.filter((e) => e.active).length} active</Td>
                </ReportTotalsRow>
                {sortedRows.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <Td>{e.name}</Td>
                    <Td>{e.role || "—"}</Td>
                    <Td>{e.mobile || "—"}</Td>
                    <Td className="capitalize">{e.employmentType.replace("_", " ")}</Td>
                    <Td>{e.joinedDate ? fmtDate(e.joinedDate) : "—"}</Td>
                    {canSeeSalary && (
                      <Td align="right">
                        {inr(e.salaryRate)} <span className="text-xs text-muted-foreground">/{SALARY_TYPE_LABELS[e.salaryType].toLowerCase()}</span>
                      </Td>
                    )}
                    <Td align="right">
                      <Badge variant={e.active ? "secondary" : "outline"}>{e.active ? "Active" : "Inactive"}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" value={`${rows.filter((e) => e.active).length} active`} showChevron={false} />
            </MobileRecordCard>
            {sortedRows.map((e) => (
              <MobileRecordCard key={e.id}>
                <MobileRecordHeader
                  title={e.name}
                  subtitle={e.mobile || "—"}
                  value={<Badge variant={e.active ? "secondary" : "outline"}>{e.active ? "Active" : "Inactive"}</Badge>}
                  showChevron={false}
                />
                <MobileRecordRow label="Role" value={e.role || "—"} />
                <MobileRecordRow label="Employment" value={<span className="capitalize">{e.employmentType.replace("_", " ")}</span>} />
                <MobileRecordRow label="Joined" value={e.joinedDate ? fmtDate(e.joinedDate) : "—"} />
                {canSeeSalary && (
                  <MobileRecordRow
                    label="Salary"
                    value={
                      <>
                        {inr(e.salaryRate)} <span className="text-xs text-muted-foreground">/{SALARY_TYPE_LABELS[e.salaryType].toLowerCase()}</span>
                      </>
                    }
                  />
                )}
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
