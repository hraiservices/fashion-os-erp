import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapLeaveRequestRow, mapHolidayRow } from "@/lib/types";
import { countLeaveDays } from "@/lib/leave";
import { DEFAULT_ATTENDANCE_SETTINGS, type AttendanceSettings } from "@/lib/attendance-settings";
import { logAction } from "@/lib/logging";

export async function GET(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const employeeId = params.get("employeeId");
  const status = params.get("status");

  let query = supabase.from("leave_requests").select("*").order("requested_at", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: (data || []).map(mapLeaveRequestRow) });
}

const bodySchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  halfDay: z.boolean().optional().default(false),
  reason: z.string().optional().default(""),
});

/** Admin/manager recording a leave request on an employee's behalf (e.g. phoned-in leave).
 *  Self-service employees use POST /api/attendance/leave-requests instead — same day-counting
 *  logic (countLeaveDays), different auth (PIN session, not manageEmployees). */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

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

  const { data: employee } = await supabase.from("employees").select("id, name").eq("id", fd.employeeId).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: fd.employeeId,
      leave_type_id: fd.leaveTypeId,
      from_date: fd.fromDate,
      to_date: fd.toDate,
      half_day: fd.halfDay,
      days,
      reason: fd.reason,
      status: "pending",
      requested_by: user.email,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });

  await logAction(supabase, user.email, `Leave request recorded for ${employee.name}: ${fd.fromDate} to ${fd.toDate} (${days}d)`);
  return NextResponse.json({ request: mapLeaveRequestRow(data) });
}
