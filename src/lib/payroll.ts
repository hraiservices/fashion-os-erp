import type { Attendance, Employee } from "@/lib/types";

export const SALARY_TYPE_LABELS: Record<Employee["salaryType"], string> = {
  monthly: "Monthly",
  daily: "Daily",
  hourly: "Hourly",
};

function daysBetweenInclusive(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

/** Number of calendar days in the month a date (YYYY-MM-DD) falls in — the divisor a monthly
 *  salary is actually quoted against, whatever the length of the payroll period being run. */
function daysInMonthOf(dateStr: string): number {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export interface AttendanceCounts {
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
}

export function countAttendance(records: Pick<Attendance, "status">[]): AttendanceCounts {
  return records.reduce<AttendanceCounts>(
    (acc, r) => {
      if (r.status === "present") acc.presentDays += 1;
      else if (r.status === "absent") acc.absentDays += 1;
      else if (r.status === "half_day") acc.halfDays += 1;
      else if (r.status === "leave") acc.leaveDays += 1;
      return acc;
    },
    { presentDays: 0, absentDays: 0, halfDays: 0, leaveDays: 0 }
  );
}

/**
 * Lightweight payroll math — no statutory deductions (PF/ESI/PT/TDS), just attendance-based
 * gross pay: monthly-salary employees lose a per-day slice of their fixed rate for each
 * absent/leave day (half-days count as half a day off); daily/hourly employees are paid only
 * for the days they actually attended. Deliberately simple — see the payroll planning
 * discussion for why full statutory compliance is out of scope.
 */
export function computeGrossPay(employee: Pick<Employee, "salaryType" | "salaryRate">, periodStart: string, periodEnd: string, counts: AttendanceCounts): number {
  const { salaryType, salaryRate } = employee;
  const { presentDays, halfDays, absentDays, leaveDays } = counts;

  if (salaryType === "monthly") {
    const totalDaysInPeriod = daysBetweenInclusive(periodStart, periodEnd);
    if (totalDaysInPeriod <= 0) return 0;
    // The per-day rate a monthly salary is actually quoted against is salaryRate divided by
    // the calendar month's own length — NOT the length of whatever period this run happens to
    // cover. Dividing by totalDaysInPeriod instead (the previous behaviour) meant any period
    // shorter than a full month, with zero recorded absences, paid the employee their ENTIRE
    // monthly salary: a 4-day run for someone on ₹1,50,000/month would show ₹1,50,000 gross for
    // those 4 days, because a 0 "unpaid day equivalent" times ANY per-day rate is still 0, so
    // gross = salaryRate - 0 regardless of how short the period was.
    const perDayRate = salaryRate / daysInMonthOf(periodStart);
    const unpaidDayEquivalent = absentDays + leaveDays + 0.5 * halfDays;
    const paidDays = Math.max(0, totalDaysInPeriod - unpaidDayEquivalent);
    return Math.round(perDayRate * paidDays * 100) / 100;
  }

  // daily and hourly (hours aren't tracked separately, so hourly is treated as a daily rate per attended day)
  const paidDayEquivalent = presentDays + 0.5 * halfDays;
  return Math.round(salaryRate * paidDayEquivalent * 100) / 100;
}
