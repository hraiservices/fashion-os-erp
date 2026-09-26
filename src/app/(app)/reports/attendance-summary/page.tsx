"use client";

import { useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useAttendanceInRange } from "@/hooks/use-attendance";
import { countAttendance } from "@/lib/payroll";
import { ReportShell, ReportTable, ReportTotalsRow, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordGrid } from "@/components/ui/mobile-record-list";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { useReportDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTableSort } from "@/hooks/use-table-sort";

type AttendanceRow = {
  employee: { id: string; name: string };
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  markedDays: number;
  attendancePct: number;
  hoursWorked: number;
  overtimeHours: number;
  flaggedDays: number;
};

const SORT_COMPARATORS: Record<string, (a: AttendanceRow, b: AttendanceRow) => number> = {
  employee: (a, b) => a.employee.name.localeCompare(b.employee.name),
  presentDays: (a, b) => a.presentDays - b.presentDays,
  absentDays: (a, b) => a.absentDays - b.absentDays,
  halfDays: (a, b) => a.halfDays - b.halfDays,
  leaveDays: (a, b) => a.leaveDays - b.leaveDays,
  markedDays: (a, b) => a.markedDays - b.markedDays,
  attendancePct: (a, b) => a.attendancePct - b.attendancePct,
  hoursWorked: (a, b) => a.hoursWorked - b.hoursWorked,
  overtimeHours: (a, b) => a.overtimeHours - b.overtimeHours,
  flaggedDays: (a, b) => a.flaggedDays - b.flaggedDays,
};
const SORT_DESC_KEYS = new Set([
  "presentDays",
  "absentDays",
  "halfDays",
  "leaveDays",
  "markedDays",
  "attendancePct",
  "hoursWorked",
  "overtimeHours",
  "flaggedDays",
]);

export default function AttendanceSummaryReportPage() {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange("this-month");
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceInRange(range.from, range.to);
  const isLoading = employeesLoading || attendanceLoading;
  const [employeeId, setEmployeeId] = useState("all");

  const rows = useMemo(() => {
    return (employees || [])
      .filter((e) => e.active)
      .filter((e) => employeeId === "all" || e.id === employeeId)
      .map((e) => {
        const records = (attendance || []).filter((a) => a.employeeId === e.id);
        const counts = countAttendance(records);
        const markedDays = counts.presentDays + counts.absentDays + counts.halfDays + counts.leaveDays;
        const attendedEquivalent = counts.presentDays + 0.5 * counts.halfDays;
        const attendancePct = markedDays > 0 ? Math.round((attendedEquivalent / markedDays) * 100) : 0;
        const hoursWorked = Math.round(records.reduce((s, r) => s + (r.hoursWorked || 0), 0) * 100) / 100;
        const overtimeHours = Math.round(records.reduce((s, r) => s + (r.overtimeHours || 0), 0) * 100) / 100;
        const flaggedDays = records.filter((r) => r.checkInWithinGeofence === false || r.checkOutWithinGeofence === false).length;
        return { employee: e, ...counts, markedDays, attendancePct, hoursWorked, overtimeHours, flaggedDays };
      })
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }, [employees, attendance, employeeId]);

  const { sortKey, sortAsc, toggleSort, applySort } = useTableSort<AttendanceRow>("attendance-summary", SORT_COMPARATORS, SORT_DESC_KEYS);
  const sortedRows = applySort(rows);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const totals = rows.reduce(
    (s, r) => ({
      presentDays: s.presentDays + r.presentDays,
      absentDays: s.absentDays + r.absentDays,
      halfDays: s.halfDays + r.halfDays,
      leaveDays: s.leaveDays + r.leaveDays,
      markedDays: s.markedDays + r.markedDays,
      hoursWorked: Math.round((s.hoursWorked + r.hoursWorked) * 100) / 100,
      overtimeHours: Math.round((s.overtimeHours + r.overtimeHours) * 100) / 100,
      flaggedDays: s.flaggedDays + r.flaggedDays,
    }),
    { presentDays: 0, absentDays: 0, halfDays: 0, leaveDays: 0, markedDays: 0, hoursWorked: 0, overtimeHours: 0, flaggedDays: 0 }
  );

  const exportRows = sortedRows.map((r) => ({
    Employee: r.employee.name,
    Present: r.presentDays,
    Absent: r.absentDays,
    "Half Day": r.halfDays,
    Leave: r.leaveDays,
    "Attendance %": `${r.attendancePct}%`,
    "Hours Worked": r.hoursWorked,
    Overtime: r.overtimeHours,
    Flagged: r.flaggedDays,
  }));

  return (
    <ReportShell
      title="Attendance Summary"
      description={`Present/absent/half-day/leave counts per employee — ${DATE_RANGE_PRESET_LABELS[preset]}`}
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="attendance-summary"
          title="Attendance Summary"
          summaryLines={[`Range: ${DATE_RANGE_PRESET_LABELS[preset]}`, `Total present days: ${totals.presentDays}`, `Total flagged: ${totals.flaggedDays}`]}
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
          <Select value={employeeId} onValueChange={(v) => v && setEmployeeId(v)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue>{employeeId === "all" ? "All Employees" : (employees || []).find((e) => e.id === employeeId)?.name || "All Employees"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {(employees || [])
                .filter((e) => e.active)
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No active employees" description="Add employees in Employees to see attendance here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th sortKey="employee" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Employee</Th>
                  <Th align="right" sortKey="presentDays" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Present</Th>
                  <Th align="right" sortKey="absentDays" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Absent</Th>
                  <Th align="right" sortKey="halfDays" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Half Day</Th>
                  <Th align="right" sortKey="leaveDays" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Leave</Th>
                  <Th align="right" sortKey="markedDays" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Days Marked</Th>
                  <Th align="right" sortKey="attendancePct" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Attendance %</Th>
                  <Th align="right" sortKey="hoursWorked" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Hours Worked</Th>
                  <Th align="right" sortKey="overtimeHours" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Overtime</Th>
                  <Th align="right" sortKey="flaggedDays" currentSort={{ key: sortKey, asc: sortAsc }} onSort={toggleSort}>Flagged</Th>
                </tr>
              </thead>
              <tbody>
                <ReportTotalsRow>
                  <Td>Total</Td>
                  <Td align="right">{totals.presentDays}</Td>
                  <Td align="right">{totals.absentDays}</Td>
                  <Td align="right">{totals.halfDays}</Td>
                  <Td align="right">{totals.leaveDays}</Td>
                  <Td align="right">{totals.markedDays}</Td>
                  <Td align="right">—</Td>
                  <Td align="right">{totals.hoursWorked > 0 ? `${totals.hoursWorked}h` : "—"}</Td>
                  <Td align="right">{totals.overtimeHours > 0 ? `${totals.overtimeHours}h` : "—"}</Td>
                  <Td align="right">{totals.flaggedDays}</Td>
                </ReportTotalsRow>
                {sortedRows.map((r) => (
                  <tr key={r.employee.id} className="border-b last:border-0">
                    <Td>{r.employee.name}</Td>
                    <Td align="right">{r.presentDays}</Td>
                    <Td align="right">{r.absentDays}</Td>
                    <Td align="right">{r.halfDays}</Td>
                    <Td align="right">{r.leaveDays}</Td>
                    <Td align="right">{r.markedDays}</Td>
                    <Td align="right">
                      <span className={r.attendancePct < 75 ? "font-medium text-red-600 dark:text-red-400" : ""}>{r.attendancePct}%</span>
                    </Td>
                    <Td align="right">{r.hoursWorked > 0 ? `${r.hoursWorked}h` : "—"}</Td>
                    <Td align="right">{r.overtimeHours > 0 ? `${r.overtimeHours}h` : "—"}</Td>
                    <Td align="right">
                      {r.flaggedDays > 0 ? <span className="font-medium text-red-600 dark:text-red-400">{r.flaggedDays}</span> : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            <MobileRecordCard className="bg-muted/40">
              <MobileRecordHeader title="Total" showChevron={false} />
              <MobileRecordGrid
                items={[
                  { label: "Present", value: totals.presentDays },
                  { label: "Absent", value: totals.absentDays },
                  { label: "Half Day", value: totals.halfDays },
                  { label: "Leave", value: totals.leaveDays },
                  { label: "Days Marked", value: totals.markedDays },
                  { label: "Hours Worked", value: totals.hoursWorked > 0 ? `${totals.hoursWorked}h` : "—" },
                  { label: "Overtime", value: totals.overtimeHours > 0 ? `${totals.overtimeHours}h` : "—" },
                  { label: "Flagged", value: totals.flaggedDays },
                ]}
              />
            </MobileRecordCard>
            {sortedRows.map((r) => (
              <MobileRecordCard key={r.employee.id}>
                <MobileRecordHeader
                  title={r.employee.name}
                  value={`${r.attendancePct}%`}
                  valueClassName={r.attendancePct < 75 ? "text-red-600 dark:text-red-400" : undefined}
                  showChevron={false}
                />
                <MobileRecordGrid
                  items={[
                    { label: "Present", value: r.presentDays },
                    { label: "Absent", value: r.absentDays },
                    { label: "Half Day", value: r.halfDays },
                    { label: "Leave", value: r.leaveDays },
                    { label: "Days Marked", value: r.markedDays },
                    { label: "Hours Worked", value: r.hoursWorked > 0 ? `${r.hoursWorked}h` : "—" },
                    { label: "Overtime", value: r.overtimeHours > 0 ? `${r.overtimeHours}h` : "—" },
                    {
                      label: "Flagged",
                      value: r.flaggedDays > 0 ? r.flaggedDays : "—",
                      valueClassName: r.flaggedDays > 0 ? "text-red-600 dark:text-red-400" : undefined,
                    },
                  ]}
                />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}
    </ReportShell>
  );
}
