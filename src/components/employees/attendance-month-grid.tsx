"use client";

import { useState } from "react";
import { AlertTriangle, Camera, Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Button } from "@/components/ui/button";
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONE, roleAvatarTone } from "@/lib/attendance-colors";
import { TONES } from "@/lib/ui-tones";
import { cn } from "@/lib/utils";
import type { Attendance, AttendanceStatus } from "@/lib/types";

const STATUS_OPTIONS = (Object.keys(ATTENDANCE_STATUS_LABELS) as AttendanceStatus[]).map((value) => ({
  value,
  label: ATTENDANCE_STATUS_LABELS[value],
  tone: ATTENDANCE_STATUS_TONE[value],
}));

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

export interface GridEmployee {
  id: string;
  name: string;
  role: string;
  photoUrl?: string | null;
}

/**
 * Employees × days of the month, color-coded by status — the shop-wide view Zoho/Odoo both lead
 * with, answering "who's been absent a lot" and "who's in today" in one screen instead of
 * re-opening a single-day list for every day you want to check. Each cell is still a one-tap
 * mark (a Popover with the same 4-way toggle the old daily page used), so this doesn't trade away
 * the fast daily-marking workflow — it just adds the month's pattern around it.
 *
 * Rows as small as 1 (a single employee) are the same component used on the employee profile
 * page's own "Recent attendance" card — one shared grid, not two parallel implementations.
 */
export function AttendanceMonthGrid({
  employees,
  days,
  attendanceByKey,
  canManage,
  today,
  onMark,
  marking,
  onViewDetail,
  onEdit,
}: {
  employees: GridEmployee[];
  /** ISO dates, oldest first. */
  days: string[];
  /** Keyed `${employeeId}:${date}`. */
  attendanceByKey: Map<string, Attendance>;
  canManage: boolean;
  today: string;
  onMark: (employeeId: string, date: string, status: AttendanceStatus) => void;
  /** `${employeeId}:${date}` currently being written — dims that one cell, not the whole grid. */
  marking?: string | null;
  /** Opens the existing self-check-in photo/geofence review dialog for this cell. */
  onViewDetail?: (attendance: Attendance, employeeName: string) => void;
  /** Opens the existing full edit dialog (check-in/out times, notes) for this cell. */
  onEdit?: (employeeId: string, employeeName: string, date: string, attendance: Attendance | undefined) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="sticky left-0 z-10 w-48 bg-muted/40 px-3 py-2 text-left font-medium text-muted-foreground">Employee</th>
            {days.map((d) => {
              const dayNum = Number(d.slice(8, 10));
              const isToday = d === today;
              const weekday = new Date(d).toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 1);
              return (
                <th key={d} className={cn("w-8 min-w-8 px-0.5 py-2 text-center text-[10px] font-medium text-muted-foreground", isToday && "bg-primary/10 text-primary")}>
                  <div>{weekday}</div>
                  <div className="tabular-nums">{dayNum}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y">
          {employees.map((e) => (
            <tr key={e.id}>
              <td className="sticky left-0 z-10 w-48 bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar size="sm" className="shrink-0">
                    {e.photoUrl && <AvatarImage src={e.photoUrl} alt={e.name} />}
                    <AvatarFallback className={cn("text-[10px] font-semibold", TONES[roleAvatarTone(e.role)].idle)}>{initials(e.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{e.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{e.role || "—"}</p>
                  </div>
                </div>
              </td>
              {days.map((d) => {
                const key = `${e.id}:${d}`;
                const a = attendanceByKey.get(key);
                const flagged = a?.checkInWithinGeofence === false || a?.checkOutWithinGeofence === false;
                const isToday = d === today;
                const isBusy = marking === key;
                const cell = (
                  <button
                    type="button"
                    disabled={!canManage || isBusy}
                    className={cn(
                      "relative flex size-7 items-center justify-center rounded-md text-[10px] font-semibold uppercase transition-opacity",
                      a ? TONES[ATTENDANCE_STATUS_TONE[a.status]].idle : "bg-muted/60 text-muted-foreground/50",
                      isToday && "ring-2 ring-primary/40",
                      isBusy && "opacity-40",
                      canManage ? "cursor-pointer hover:opacity-80" : "cursor-default"
                    )}
                    aria-label={`${e.name} · ${d} · ${a ? ATTENDANCE_STATUS_LABELS[a.status] : "Not marked"}`}
                  >
                    {a ? ATTENDANCE_STATUS_LABELS[a.status].slice(0, 1) : ""}
                    {flagged && <AlertTriangle className="absolute -right-1 -top-1 size-2.5 text-red-600" />}
                  </button>
                );
                if (!canManage) {
                  return (
                    <td key={d} className={cn("px-0.5 py-1 text-center", isToday && "bg-primary/5")}>
                      {cell}
                    </td>
                  );
                }
                return (
                  <td key={d} className={cn("px-0.5 py-1 text-center", isToday && "bg-primary/5")}>
                    <Popover open={openKey === key} onOpenChange={(v) => setOpenKey(v ? key : null)}>
                      <PopoverTrigger render={cell} />
                      <PopoverContent className="w-auto space-y-2 p-2" align="center">
                        <SegmentedToggle
                          value={a?.status ?? ("" as AttendanceStatus)}
                          onChange={(v) => {
                            onMark(e.id, d, v);
                            setOpenKey(null);
                          }}
                          options={STATUS_OPTIONS}
                          ariaLabel={`Attendance status for ${e.name} on ${d}`}
                        />
                        {(a?.source === "self_service" || onEdit) && (
                          <div className="flex items-center justify-end gap-1 border-t pt-2">
                            {a?.source === "self_service" && onViewDetail && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-xs"
                                onClick={() => {
                                  onViewDetail(a, e.name);
                                  setOpenKey(null);
                                }}
                              >
                                <Camera className="size-3.5" /> {flagged ? "Flagged check-in" : "View check-in"}
                              </Button>
                            )}
                            {onEdit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 text-xs"
                                onClick={() => {
                                  onEdit(e.id, e.name, d, a);
                                  setOpenKey(null);
                                }}
                              >
                                <Pencil className="size-3.5" /> Edit details
                              </Button>
                            )}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
