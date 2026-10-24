import type { AttendanceStatus } from "@/lib/types";
import type { Tone } from "@/lib/ui-tones";

/** One color per attendance status, shared by every surface that shows a status (the daily Mark
 *  Attendance page, My Attendance, the self-service checkin kiosk) so "Present" reads the same
 *  green everywhere instead of each page inventing its own palette. */
export const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, Tone> = {
  present: "green",
  half_day: "amber",
  leave: "blue",
  absent: "rose",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  half_day: "Half day",
  leave: "Leave",
  absent: "Absent",
};

/** Purely decorative — colors an employee's avatar initial by their role, so a day's list reads
 *  at a glance (same purpose as STAGE_META elsewhere: color as a scanning aid, not a status). Free-
 *  text role field, so this matches by substring rather than an exact enum. */
export function roleAvatarTone(role: string): Tone {
  const r = role.toLowerCase();
  if (r.includes("admin")) return "purple";
  if (r.includes("manager")) return "blue";
  if (r.includes("tailor")) return "amber";
  if (r.includes("sales")) return "teal";
  return "rose";
}
