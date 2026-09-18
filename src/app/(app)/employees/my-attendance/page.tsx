"use client";

import { CalendarCheck } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAttendanceForEmployee } from "@/hooks/use-attendance";
import { fmtDate } from "@/lib/format";
import { fmtTime } from "@/lib/day-book";
import type { AttendanceStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half Day",
  leave: "Leave",
};

const STATUS_VARIANT: Record<AttendanceStatus, "secondary" | "outline" | "destructive"> = {
  present: "secondary",
  absent: "destructive",
  half_day: "outline",
  leave: "outline",
};

/** Self-service: a staff login's own last 90 days of attendance, scoped server-side by RLS
 *  (employee_attendance's per-row policy already lets the linked employee read their own rows —
 *  see lockdown_reads_per_row.sql) — not gated on manageEmployees, since this is "my own data". */
export default function MyAttendancePage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: records, isLoading: recordsLoading } = useAttendanceForEmployee(user?.employeeId || "");
  const isLoading = userLoading || (!!user?.employeeId && recordsLoading);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user?.employeeId) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={CalendarCheck} title="No employee record linked" description="Your login isn't linked to a staff record, so there's no attendance to show here. Ask an admin to link your account." />
      </div>
    );
  }

  const rows = records || [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="My Attendance" description="Your last 90 days" />

      {rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No attendance marked yet" description="Your attendance will appear here once a day is marked." />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{fmtDate(r.date)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.checkInAt ? fmtTime(r.checkInAt) : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.checkOutAt ? fmtTime(r.checkOutAt) : "—"}</TableCell>
                    <TableCell className="text-right">{r.hoursWorked ? `${r.hoursWorked}h` : "—"}</TableCell>
                    <TableCell className="text-right">{r.overtimeHours ? `${r.overtimeHours}h` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <MobileRecordList className="p-2">
            {rows.map((r) => (
              <MobileRecordCard key={r.id}>
                <MobileRecordHeader title={fmtDate(r.date)} value={<Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>} showChevron={false} />
                <MobileRecordRow label="Check-in" value={r.checkInAt ? fmtTime(r.checkInAt) : "—"} />
                <MobileRecordRow label="Check-out" value={r.checkOutAt ? fmtTime(r.checkOutAt) : "—"} />
                <MobileRecordRow label="Hours" value={r.hoursWorked ? `${r.hoursWorked}h` : "—"} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </div>
      )}
    </div>
  );
}
