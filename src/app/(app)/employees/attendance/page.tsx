"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, CalendarCheck, Camera } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useAttendanceForDate, useMarkAttendance } from "@/hooks/use-attendance";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { AttendanceDetailDialog } from "@/components/employees/attendance-detail-dialog";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, Attendance } from "@/lib/types";

const STATUSES: { value: AttendanceStatus; label: string; tone: string }[] = [
  { value: "present", label: "Present", tone: "border-green-500/30 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400" },
  { value: "half_day", label: "Half day", tone: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  { value: "leave", label: "Leave", tone: "border-border text-muted-foreground" },
  { value: "absent", label: "Absent", tone: "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const [date, setDate] = useState(todayISO());
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceForDate(date);
  const { data: user } = useCurrentUser();
  const markAttendance = useMarkAttendance();
  const [detailFor, setDetailFor] = useState<{ attendance: Attendance; employeeName: string } | null>(null);

  const canManage = !!user?.perms.manageEmployees;
  const active = (employees || []).filter((e) => e.active);
  const attendanceByEmployee = new Map((attendance || []).map((a) => [a.employeeId, a]));

  async function mark(employeeId: string, status: AttendanceStatus) {
    try {
      await markAttendance.mutateAsync({ employeeId, date, status, userEmail: user?.email });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark attendance");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Employees
      </Link>
      <PageHeader title="Attendance" description="Mark daily attendance for active staff" actions={<DatePicker value={date} onChange={setDate} className="w-40" />} />

      {employeesLoading || attendanceLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No active employees" description="Add employees first, or mark them active." />
      ) : (
        <div className="space-y-2">
          {active.map((e) => {
            const current = attendanceByEmployee.get(e.id);
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.role || "—"}</p>
                </div>
                {current?.source === "self_service" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setDetailFor({ attendance: current, employeeName: e.name })}
                  >
                    <Camera className="size-3.5" />
                    {current.checkInWithinGeofence === false || current.checkOutWithinGeofence === false ? (
                      <span className="text-red-600 dark:text-red-400">Flagged</span>
                    ) : (
                      "Self check-in"
                    )}
                  </Button>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      disabled={!canManage || markAttendance.isPending}
                      onClick={() => mark(e.id, s.value)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                        current?.status === s.value ? s.tone : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detailFor && (
        <AttendanceDetailDialog
          attendance={detailFor.attendance}
          employeeName={detailFor.employeeName}
          open={!!detailFor}
          onOpenChange={(v) => !v && setDetailFor(null)}
        />
      )}
    </div>
  );
}
