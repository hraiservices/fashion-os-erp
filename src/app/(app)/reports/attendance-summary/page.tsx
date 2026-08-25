"use client";

import { useMemo, useState } from "react";
import { Printer, CalendarCheck } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { istDateString } from "@/lib/ist-date";
import { useAttendanceInRange } from "@/hooks/use-attendance";
import { countAttendance } from "@/lib/payroll";
import { printReport } from "@/lib/export";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

function currentMonth() {
  // istDateString, not toISOString: before 05:30 IST on the 1st, UTC is still the previous
  // month, so this report would open on the wrong month and drive payroll off it.
  return istDateString().slice(0, 7);
}

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${ym}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export default function AttendanceSummaryReportPage() {
  const [month, setMonth] = useState(currentMonth());
  const { from, to } = monthRange(month);
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceInRange(from, to);
  const isLoading = employeesLoading || attendanceLoading;

  const totalDaysInMonth = new Date(to).getDate();

  const rows = useMemo(() => {
    return (employees || [])
      .filter((e) => e.active)
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
  }, [employees, attendance]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell
      title="Attendance Summary"
      description={`Present/absent/half-day/leave counts per employee — ${totalDaysInMonth}-day month`}
      actions={
        <>
          <Input type="month" className="w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
          {rows.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                printReport(
                  "Attendance Summary",
                  `<table><thead><tr><th>Employee</th><th>Present</th><th>Absent</th><th>Half Day</th><th>Leave</th><th>Attendance %</th><th>Hours Worked</th><th>Overtime</th><th>Flagged</th></tr></thead><tbody>${rows
                    .map(
                      (r) =>
                        `<tr><td>${r.employee.name}</td><td>${r.presentDays}</td><td>${r.absentDays}</td><td>${r.halfDays}</td><td>${r.leaveDays}</td><td>${r.attendancePct}%</td><td>${r.hoursWorked}h</td><td>${r.overtimeHours}h</td><td>${r.flaggedDays}</td></tr>`
                    )
                    .join("")}</tbody></table>`
                )
              }
            >
              <Printer className="size-4" /> Print
            </Button>
          )}
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No active employees" description="Add employees in Employees to see attendance here." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Employee</Th>
              <Th align="right">Present</Th>
              <Th align="right">Absent</Th>
              <Th align="right">Half Day</Th>
              <Th align="right">Leave</Th>
              <Th align="right">Days Marked</Th>
              <Th align="right">Attendance %</Th>
              <Th align="right">Hours Worked</Th>
              <Th align="right">Overtime</Th>
              <Th align="right">Flagged</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
      )}
    </ReportShell>
  );
}
