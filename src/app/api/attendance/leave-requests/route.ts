import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";
import { mapLeaveRequestRow, mapLeaveTypeRow, mapHolidayRow } from "@/lib/types";
import { countLeaveDays } from "@/lib/leave";
import { DEFAULT_ATTENDANCE_SETTINGS, type AttendanceSettings } from "@/lib/attendance-settings";
import { notifyLeaveRequested } from "@/lib/logging";

/** The logged-in employee's own leave requests, plus the active leave types (for the Apply
 *  form's dropdown) — bundled in one call since self-service has no other way to read
 *  leave_types (that table is RLS-gated to a real Supabase Auth session). */
export async function GET() {
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const [{ data: requestRows }, { data: leaveTypeRows }] = await Promise.all([
    supabase.from("leave_requests").select("*").eq("employee_id", employeeId).order("requested_at", { ascending: false }).limit(30),
    supabase.from("leave_types").select("*").eq("active", true).order("name"),
  ]);

  return NextResponse.json({
    requests: (requestRows || []).map(mapLeaveRequestRow),
    leaveTypes: (leaveTypeRows || []).map(mapLeaveTypeRow),
  });
}

const bodySchema = z.object({
  leaveTypeId: z.string().min(1),
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  halfDay: z.boolean().optional().default(false),
  reason: z.string().optional().default(""),
});

export async function POST(request: Request) {
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  if (fd.toDate < fd.fromDate) return NextResponse.json({ error: "To date must be on or after from date" }, { status: 400 });

  const [{ data: holidayRows }, { data: attSettingRow }] = await Promise.all([
    supabase.from("holidays").select("*").eq("active", true).gte("date", fd.fromDate).lte("date", fd.toDate),
    supabase.from("app_settings").select("value").eq("key", "attendanceSettings").maybeSingle(),
  ]);
  const attendanceSettings: AttendanceSettings = { ...DEFAULT_ATTENDANCE_SETTINGS, ...((attSettingRow?.value as Partial<AttendanceSettings>) || {}) };
  const holidayDates = new Set((holidayRows || []).map(mapHolidayRow).map((h) => h.date));

  const { days } = countLeaveDays(fd.fromDate, fd.toDate, fd.halfDay, holidayDates, attendanceSettings.weeklyOffDay);
  if (days <= 0) {
    return NextResponse.json({ error: "The selected range has no chargeable leave days (all weekly-offs/holidays)" }, { status: 400 });
  }

  // Deliberately not blocking on remaining balance here — an admin may still want to approve
  // an over-limit request as unpaid/exception leave. The self-service form shows the employee
  // their remaining balance before submit so this is an informed choice, not a silent gap.
  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: employeeId,
      leave_type_id: fd.leaveTypeId,
      from_date: fd.fromDate,
      to_date: fd.toDate,
      half_day: fd.halfDay,
      days,
      reason: fd.reason,
      status: "pending",
      requested_by: "self-service",
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });

  const { data: employee } = await supabase.from("employees").select("name").eq("id", employeeId).maybeSingle();
  await notifyLeaveRequested(supabase, { employeeId, employeeName: employee?.name || "An employee", fromDate: fd.fromDate, toDate: fd.toDate, days });

  return NextResponse.json({ request: mapLeaveRequestRow(data) });
}
