"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useAttendanceInRange, useMarkAttendance } from "@/hooks/use-attendance";
import { useCurrentUser } from "@/hooks/use-current-user";
import { hapticTap } from "@/lib/haptics";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { AttendanceMonthGrid } from "@/components/employees/attendance-month-grid";
import { AttendanceDetailDialog } from "@/components/employees/attendance-detail-dialog";
import { AttendanceEditDialog } from "@/components/employees/attendance-edit-dialog";
import { toISODate } from "@/components/ui/date-picker";
import type { Attendance, AttendanceStatus } from "@/lib/types";
import { BackLink } from "@/components/ui/back-link";

function todayISO() {
  return toISODate(new Date());
}

/** Every day in `month` (YYYY-MM), oldest first — capped at today for the current month so the
 *  grid doesn't stretch out marking cells for days that haven't happened yet. */
function daysInMonth(month: string, today: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const isCurrentMonth = month === today.slice(0, 7);
  const cap = isCurrentMonth ? Number(today.slice(8, 10)) : last;
  return Array.from({ length: cap }, (_, i) => {
    const d = new Date(y, m - 1, i + 1);
    return toISODate(d);
  });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AttendancePage() {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const days = useMemo(() => daysInMonth(month, today), [month, today]);
  const from = days[0];
  const to = days[days.length - 1];
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceInRange(from || month, to || month);
  const { data: user } = useCurrentUser();
  const markAttendance = useMarkAttendance();
  const [markingKey, setMarkingKey] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<{ attendance: Attendance; employeeName: string } | null>(null);
  const [editFor, setEditFor] = useState<{ employeeId: string; employeeName: string; date: string; attendance?: Attendance } | null>(null);

  const canManage = !!user?.perms.manageEmployees;
  const active = (employees || []).filter((e) => e.active);
  const attendanceByKey = useMemo(() => {
    const map = new Map();
    for (const a of attendance || []) map.set(`${a.employeeId}:${a.date}`, a);
    return map;
  }, [attendance]);

  async function mark(employeeId: string, date: string, status: AttendanceStatus) {
    hapticTap();
    const key = `${employeeId}:${date}`;
    setMarkingKey(key);
    try {
      await markAttendance.mutateAsync({ employeeId, date, status, userEmail: user?.email });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark attendance");
    } finally {
      setMarkingKey(null);
    }
  }

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <BackLink href="/employees">Employees</BackLink>
      <PageHeader
        title="Attendance"
        description="One tap per cell to mark a day — color shows the month's pattern at a glance"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-28 text-center text-sm font-medium">{monthLabel}</span>
            <Button variant="outline" size="icon" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month === today.slice(0, 7)} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      {employeesLoading || attendanceLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : active.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No active employees" description="Add employees first, or mark them active." />
      ) : (
        <AttendanceMonthGrid
          employees={active.map((e) => ({ id: e.id, name: e.name, role: e.role, photoUrl: e.photoUrl }))}
          days={days}
          attendanceByKey={attendanceByKey}
          canManage={canManage}
          today={today}
          onMark={mark}
          marking={markingKey}
          onViewDetail={(a, employeeName) => setDetailFor({ attendance: a, employeeName })}
          onEdit={(employeeId, employeeName, date, a) => setEditFor({ employeeId, employeeName, date, attendance: a })}
        />
      )}

      {detailFor && (
        <AttendanceDetailDialog
          attendance={detailFor.attendance}
          employeeName={detailFor.employeeName}
          open={!!detailFor}
          onOpenChange={(v) => !v && setDetailFor(null)}
        />
      )}

      {editFor && (
        <AttendanceEditDialog
          employeeId={editFor.employeeId}
          employeeName={editFor.employeeName}
          date={editFor.date}
          current={editFor.attendance}
          open={!!editFor}
          onOpenChange={(v) => !v && setEditFor(null)}
        />
      )}
    </div>
  );
}
