import { TONES } from "@/lib/ui-tones";
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONE } from "@/lib/attendance-colors";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/types";

/** The one status pill every attendance surface should use — see attendance-colors.ts for why. */
export function AttendanceStatusBadge({ status, className }: { status: AttendanceStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TONES[ATTENDANCE_STATUS_TONE[status]].idle, className)}>
      {ATTENDANCE_STATUS_LABELS[status]}
    </span>
  );
}
