import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";
import { mapLeaveTypeRow, mapLeaveBalanceAdjustmentRow, mapLeaveRequestRow, mapHolidayRow } from "@/lib/types";
import { computeLeaveBalances } from "@/lib/leave";
import { DEFAULT_ATTENDANCE_SETTINGS, type AttendanceSettings } from "@/lib/attendance-settings";

/** The logged-in employee's own leave balance for the current year — same computation as the
 *  admin route (src/app/api/employees/[id]/leave-balance) via the shared computeLeaveBalances
 *  helper, but authenticated by PIN session instead of manageEmployees. Also returns this
 *  year's holiday dates + the weekly-off day so the check-in page can run countLeaveDays()
 *  client-side for a live "days this request will use" preview before submit. */
export async function GET() {
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const year = new Date().getFullYear();

  const [{ data: leaveTypeRows }, { data: balanceRows }, { data: adjustmentRows }, { data: requestRows }, { data: holidayRows }, { data: attSettingRow }] = await Promise.all([
    supabase.from("leave_types").select("*").eq("active", true).order("name"),
    supabase.from("leave_balances").select("leave_type_id, allocated_days, carried_forward_days").eq("employee_id", employeeId).eq("year", year),
    supabase.from("leave_balance_adjustments").select("*").eq("employee_id", employeeId).eq("year", year),
    supabase.from("leave_requests").select("*").eq("employee_id", employeeId).eq("status", "approved").gte("from_date", `${year}-01-01`).lte("from_date", `${year}-12-31`),
    supabase.from("holidays").select("*").eq("active", true).gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
    supabase.from("app_settings").select("value").eq("key", "attendanceSettings").maybeSingle(),
  ]);

  const balances = computeLeaveBalances(
    (leaveTypeRows || []).map(mapLeaveTypeRow),
    (balanceRows || []).map((r) => ({ leaveTypeId: r.leave_type_id, allocatedDays: r.allocated_days, carriedForwardDays: r.carried_forward_days })),
    (adjustmentRows || []).map(mapLeaveBalanceAdjustmentRow),
    (requestRows || []).map(mapLeaveRequestRow)
  );

  const attendanceSettings: AttendanceSettings = { ...DEFAULT_ATTENDANCE_SETTINGS, ...((attSettingRow?.value as Partial<AttendanceSettings>) || {}) };

  return NextResponse.json({
    year,
    balances,
    holidayDates: (holidayRows || []).map(mapHolidayRow).map((h) => h.date),
    weeklyOffDay: attendanceSettings.weeklyOffDay,
  });
}
