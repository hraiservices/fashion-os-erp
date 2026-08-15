// Shared leave-day counting logic — used by both the admin leave-request API route and the
// self-service (PIN session) route, so a request submitted through either entry point counts
// days identically. Mirrors approve_leave_request's SQL day-walk (weeklyOffDay/holiday skip)
// so the "days" stored on submission matches what actually gets marked in employee_attendance
// on approval.

/** yyyy-mm-dd, treated as a plain calendar date — never construct with `new Date(iso)` for this
 *  kind of loop, since that parses as UTC midnight and can shift a day under IST. */
function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toDateOnlyString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface LeaveDayCountResult {
  /** Total leave days charged against the balance — excludes weekly-offs and holidays, and is
   *  0.5 for a single-day half-day request. */
  days: number;
  /** Calendar dates (yyyy-mm-dd) actually counted, for display/preview. */
  countedDates: string[];
  /** Dates in range skipped because they're a weekly-off or holiday. */
  skippedDates: string[];
}

/**
 * @param fromDate yyyy-mm-dd
 * @param toDate yyyy-mm-dd (inclusive)
 * @param halfDay only applied when fromDate === toDate
 * @param holidayDates set of yyyy-mm-dd holiday dates
 * @param weeklyOffDay 0 (Sunday) – 6 (Saturday), or null for no fixed weekly off
 */
import type { LeaveType, LeaveBalanceAdjustment, LeaveRequest, LeaveBalanceSummary } from "@/lib/types";

/**
 * Computes each leave type's balance for one employee/year. "Used" is always summed from
 * approved requests rather than trusted from a stored counter — same principle as
 * order.balance in business-rules.ts. Called from both the admin API route
 * (src/app/api/employees/[id]/leave-balance) and the self-service route
 * (src/app/api/attendance/leave-balance) so the math can't drift between the two.
 */
export function computeLeaveBalances(
  leaveTypes: LeaveType[],
  allocations: { leaveTypeId: string; allocatedDays: number; carriedForwardDays: number }[],
  adjustments: LeaveBalanceAdjustment[],
  approvedRequests: LeaveRequest[]
): LeaveBalanceSummary[] {
  return leaveTypes
    .filter((t) => t.active)
    .map((t) => {
      const allocation = allocations.find((a) => a.leaveTypeId === t.id);
      const allocated = allocation?.allocatedDays ?? t.annualDays;
      const carriedForward = allocation?.carriedForwardDays ?? 0;
      const adjusted = adjustments.filter((a) => a.leaveTypeId === t.id).reduce((sum, a) => sum + a.days, 0);
      const used = approvedRequests.filter((r) => r.leaveTypeId === t.id).reduce((sum, r) => sum + r.days, 0);
      const remaining = Math.round((allocated + carriedForward + adjusted - used) * 100) / 100;
      return { leaveTypeId: t.id, leaveTypeName: t.name, paid: t.paid, allocated, carriedForward, adjusted, used, remaining };
    });
}

export function countLeaveDays(
  fromDate: string,
  toDate: string,
  halfDay: boolean,
  holidayDates: ReadonlySet<string>,
  weeklyOffDay: number | null
): LeaveDayCountResult {
  const countedDates: string[] = [];
  const skippedDates: string[] = [];

  const start = parseDateOnly(fromDate);
  const end = parseDateOnly(toDate);
  if (end < start) return { days: 0, countedDates, skippedDates };

  const isSingleDay = fromDate === toDate;

  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const iso = toDateOnlyString(cur);
    const isWeeklyOff = weeklyOffDay != null && cur.getDay() === weeklyOffDay;
    const isHoliday = holidayDates.has(iso);
    if (isWeeklyOff || isHoliday) {
      skippedDates.push(iso);
    } else {
      countedDates.push(iso);
    }
  }

  const days = isSingleDay && halfDay ? countedDates.length * 0.5 : countedDates.length;
  return { days, countedDates, skippedDates };
}
