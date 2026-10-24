"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Camera, MoreVertical, Pencil } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useAttendanceForDate, useMarkAttendance } from "@/hooks/use-attendance";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { DatePicker, toISODate } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { AttendanceDetailDialog } from "@/components/employees/attendance-detail-dialog";
import { AttendanceEditDialog } from "@/components/employees/attendance-edit-dialog";
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONE, roleAvatarTone } from "@/lib/attendance-colors";
import { TONES } from "@/lib/ui-tones";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, Attendance } from "@/lib/types";
import { BackLink } from "@/components/ui/back-link";

const STATUS_OPTIONS = (Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[]).map((value) => ({
  value,
  label: ATTENDANCE_STATUS_LABELS[value],
  tone: ATTENDANCE_STATUS_TONE[value],
}));

function todayISO() {
  return toISODate(new Date());
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export default function AttendancePage() {
  const [date, setDate] = useState(todayISO());
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceForDate(date);
  const { data: user } = useCurrentUser();
  const markAttendance = useMarkAttendance();
  const [detailFor, setDetailFor] = useState<{ attendance: Attendance; employeeName: string } | null>(null);
  const [editFor, setEditFor] = useState<{ employeeId: string; employeeName: string; attendance?: Attendance } | null>(null);

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
      <BackLink href="/employees">Employees</BackLink>
      <PageHeader title="Attendance" description="Mark daily attendance for active staff" actions={<DatePicker value={date} onChange={setDate} className="w-40" />} />

      {employeesLoading || attendanceLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No active employees" description="Add employees first, or mark them active." />
      ) : (
        <div className="space-y-2">
          {active.map((e) => {
            const current = attendanceByEmployee.get(e.id);
            const flagged = current?.checkInWithinGeofence === false || current?.checkOutWithinGeofence === false;
            const hasMenu = current?.source === "self_service" || canManage;
            return (
              <div key={e.id} className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <Avatar size="lg" className="shrink-0">
                    <AvatarFallback className={cn("font-semibold", TONES[roleAvatarTone(e.role)].idle)}>{initials(e.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.role || "—"}</p>
                  </div>
                  {hasMenu && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${e.name}`}>
                            <MoreVertical className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        {current?.source === "self_service" && (
                          <DropdownMenuItem onClick={() => setDetailFor({ attendance: current, employeeName: e.name })}>
                            <Camera className="size-4" />
                            {flagged ? <span className="text-red-600 dark:text-red-400">Self check-in — flagged</span> : "View self check-in"}
                          </DropdownMenuItem>
                        )}
                        {canManage && (
                          <DropdownMenuItem onClick={() => setEditFor({ employeeId: e.id, employeeName: e.name, attendance: current })}>
                            <Pencil className="size-4" /> Edit attendance
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {/* No status is ever truly "" — the cast just lets an unmarked day render with
                    nothing selected instead of forcing a default. */}
                <div className={cn((!canManage || markAttendance.isPending) && "pointer-events-none opacity-60")}>
                  <SegmentedToggle
                    value={current?.status ?? ("" as AttendanceStatus)}
                    onChange={(v) => mark(e.id, v)}
                    options={STATUS_OPTIONS}
                    ariaLabel={`Attendance status for ${e.name}`}
                  />
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

      {editFor && (
        <AttendanceEditDialog
          employeeId={editFor.employeeId}
          employeeName={editFor.employeeName}
          date={date}
          current={editFor.attendance}
          open={!!editFor}
          onOpenChange={(v) => !v && setEditFor(null)}
        />
      )}
    </div>
  );
}
