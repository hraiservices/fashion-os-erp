"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { useMarkAttendance } from "@/hooks/use-attendance";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { Attendance, AttendanceStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half day" },
  { value: "leave", label: "Leave" },
  { value: "absent", label: "Absent" },
];

/** Admin correction dialog for one employee/date — lets manageEmployees holders override status
 *  and set/adjust check-in, check-out and notes, including on a day the employee self-checked-in
 *  (a mistyped time, a forgotten check-out, a note explaining an exception). Goes through the
 *  same POST /api/attendance/mark route as the quick-mark status buttons — this is just a UI for
 *  the checkIn/checkOut/notes fields that route already accepted but the grid never exposed. */
export function AttendanceEditDialog({
  employeeId,
  employeeName,
  date,
  current,
  open,
  onOpenChange,
}: {
  employeeId: string;
  employeeName: string;
  date: string;
  current?: Attendance;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: user } = useCurrentUser();
  const markAttendance = useMarkAttendance();
  const [status, setStatus] = useState<AttendanceStatus>(current?.status || "present");
  const [checkIn, setCheckIn] = useState(current?.checkIn || "");
  const [checkOut, setCheckOut] = useState(current?.checkOut || "");
  const [notes, setNotes] = useState(current?.notes || "");

  async function handleSave() {
    try {
      await markAttendance.mutateAsync({
        employeeId,
        date,
        status,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        notes,
        userEmail: user?.email,
      });
      toast.success(`Attendance updated for ${employeeName}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update attendance");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit attendance — {employeeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Status</Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v as AttendanceStatus)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-bold">Check-in</Label>
              <TimePicker value={checkIn} onChange={setCheckIn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-bold">Check-out</Label>
              <TimePicker value={checkOut} onChange={setCheckOut} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Notes</Label>
            <Textarea rows={2} placeholder="Reason for correction, exception, etc…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={markAttendance.isPending} onClick={handleSave}>
            {markAttendance.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
