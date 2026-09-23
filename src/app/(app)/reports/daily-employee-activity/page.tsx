"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useAttendanceInRange } from "@/hooks/use-attendance";
import { fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordGrid } from "@/components/ui/mobile-record-list";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { ReportActionsMenu } from "@/components/reports/report-actions-menu";
import { useReportDateRange, DATE_RANGE_PRESET_LABELS } from "@/lib/report-date-range";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Attendance, Employee } from "@/lib/types";

function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
}

/**
 * Daily KRA/KPI-style report — one row per active employee for the selected range: attendance,
 * hours worked, and whether they've filled in their "what did you do today" work note (required
 * at self-service check-out for every role except tailors — see checkout/route.ts). Click a row
 * to see that employee's full note history for the range, not just today's.
 */
export default function DailyEmployeeActivityPage() {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange("today");
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceInRange(range.from, range.to);
  const isLoading = employeesLoading || attendanceLoading;
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);

  const rows = useMemo(() => {
    return (employees || [])
      .filter((e) => e.active)
      .map((e) => {
        const records = (attendance || [])
          .filter((a) => a.employeeId === e.id)
          .sort((a, b) => b.date.localeCompare(a.date));
        const isTailor = (e.role || "").toLowerCase().includes("tailor");
        const daysCheckedOut = records.filter((r) => r.checkOutAt).length;
        const daysWithNote = records.filter((r) => r.checkOutAt && r.workNotes.trim()).length;
        const hoursWorked = Math.round(records.reduce((s, r) => s + (r.hoursWorked || 0), 0) * 100) / 100;
        const latestNote = records.find((r) => r.workNotes.trim())?.workNotes || "";
        return { employee: e, records, isTailor, daysCheckedOut, daysWithNote, hoursWorked, latestNote };
      })
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }, [employees, attendance]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  const exportRows = rows.map((r) => ({
    Employee: r.employee.name,
    "Days Checked Out": r.daysCheckedOut,
    "Hours Worked": r.hoursWorked,
    "Notes Submitted": r.isTailor ? "N/A (tailor)" : `${r.daysWithNote}/${r.daysCheckedOut}`,
    "Latest Note": r.latestNote,
  }));

  return (
    <ReportShell
      title="Daily Employee Activity"
      description={`Attendance and daily work notes per employee — ${DATE_RANGE_PRESET_LABELS[preset]}`}
      actions={
        <ReportActionsMenu
          rows={exportRows}
          filename="daily-employee-activity"
          title="Daily Employee Activity"
          summaryLines={[`Range: ${DATE_RANGE_PRESET_LABELS[preset]}`, `Employees: ${rows.length}`]}
        />
      }
    >
      <ReportFilterBar preset={preset} onPresetChange={setPreset} customFrom={customFrom} onCustomFromChange={setCustomFrom} customTo={customTo} onCustomToChange={setCustomTo} />

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No active employees" description="Add employees in Employees to see daily activity here." />
      ) : (
        <>
          <div className="hidden sm:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Employee</Th>
                  <Th align="right">Days Checked Out</Th>
                  <Th align="right">Hours Worked</Th>
                  <Th>Work Notes</Th>
                  <Th>Latest Note</Th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.employee.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDetailEmployee(r.employee)}>
                    <Td className="font-medium">{r.employee.name}</Td>
                    <Td align="right">{r.daysCheckedOut}</Td>
                    <Td align="right">{r.hoursWorked > 0 ? `${r.hoursWorked}h` : "—"}</Td>
                    <Td>
                      {r.isTailor ? (
                        <span className="text-muted-foreground">N/A (tailor)</span>
                      ) : (
                        <span className={r.daysWithNote < r.daysCheckedOut ? "font-medium text-red-600 dark:text-red-400" : ""}>
                          {r.daysWithNote}/{r.daysCheckedOut}
                        </span>
                      )}
                    </Td>
                    <Td className="max-w-64 truncate text-muted-foreground">{r.latestNote || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>

          <MobileRecordList>
            {rows.map((r) => (
              <MobileRecordCard key={r.employee.id} onClick={() => setDetailEmployee(r.employee)}>
                <MobileRecordHeader title={r.employee.name} value={r.hoursWorked > 0 ? `${r.hoursWorked}h` : "—"} />
                <MobileRecordGrid
                  items={[
                    { label: "Days Checked Out", value: r.daysCheckedOut },
                    {
                      label: "Notes Submitted",
                      value: r.isTailor ? "N/A" : `${r.daysWithNote}/${r.daysCheckedOut}`,
                      valueClassName: !r.isTailor && r.daysWithNote < r.daysCheckedOut ? "text-red-600 dark:text-red-400" : undefined,
                    },
                  ]}
                />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </>
      )}

      <EmployeeNoteHistoryDialog
        employee={detailEmployee}
        records={detailEmployee ? rows.find((r) => r.employee.id === detailEmployee.id)?.records || [] : []}
        onOpenChange={(v) => !v && setDetailEmployee(null)}
      />
    </ReportShell>
  );
}

function EmployeeNoteHistoryDialog({
  employee,
  records,
  onOpenChange,
}: {
  employee: Employee | null;
  records: Attendance[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!employee} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee?.name} — Daily Work Notes</DialogTitle>
        </DialogHeader>
        {records.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No attendance records in this range</p>
        ) : (
          <div className="space-y-3">
            {records.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{fmtDate(r.date)}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtTime(r.checkInAt)} – {fmtTime(r.checkOutAt)}
                  </p>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">{r.workNotes.trim() || "No note added"}</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
