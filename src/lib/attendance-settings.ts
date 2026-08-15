export interface AttendanceSettings {
  standardShiftHours: number;
  /** Flat rupees per hour beyond standardShiftHours — per the "flat OT rate" decision, not a
   *  multiplier of each employee's own rate. */
  otRatePerHour: number;
  /** 0 (Sunday) – 6 (Saturday), or null if the shop has no fixed weekly off. Used by leave-day
   *  counting (src/lib/leave.ts) and the approve_leave_request RPC to skip weekly-off days
   *  when marking attendance for an approved leave request. */
  weeklyOffDay: number | null;
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  standardShiftHours: 8,
  otRatePerHour: 0,
  weeklyOffDay: null,
};

/** Sane ceiling for a single shift's hours_worked — guards against clock-skew/bug-produced
 *  absurd values (e.g. a missed checkout from a prior day) blowing up payroll math. */
export const MAX_SHIFT_HOURS = 16;
