export interface AttendanceSettings {
  standardShiftHours: number;
  /** Flat rupees per hour beyond standardShiftHours — per the "flat OT rate" decision, not a
   *  multiplier of each employee's own rate. */
  otRatePerHour: number;
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  standardShiftHours: 8,
  otRatePerHour: 0,
};

/** Sane ceiling for a single shift's hours_worked — guards against clock-skew/bug-produced
 *  absurd values (e.g. a missed checkout from a prior day) blowing up payroll math. */
export const MAX_SHIFT_HOURS = 16;
