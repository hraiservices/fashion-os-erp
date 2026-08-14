import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";

/** Tells the check-in page who's logged in and today's attendance state, so it knows whether
 *  to show "Check in" or "Check out" (or "Done for today"). */
export async function GET() {
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const { data: employee } = await supabase.from("employees").select("id, name, role, location_id, active").eq("id", employeeId).maybeSingle();
  if (!employee || !employee.active) return NextResponse.json({ error: "Employee not found or inactive" }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: todayAttendance } = await supabase
    .from("employee_attendance")
    .select("check_in_at, check_out_at, hours_worked, overtime_hours")
    .eq("employee_id", employeeId)
    .eq("date", today)
    .maybeSingle();

  let location: { name: string; hasCoordinates: boolean } | null = null;
  if (employee.location_id) {
    const { data: loc } = await supabase.from("shop_locations").select("name").eq("id", employee.location_id).maybeSingle();
    if (loc) location = { name: loc.name, hasCoordinates: true };
  }

  return NextResponse.json({
    employee: { id: employee.id, name: employee.name, role: employee.role },
    location,
    checkedInAt: todayAttendance?.check_in_at ?? null,
    checkedOutAt: todayAttendance?.check_out_at ?? null,
    hoursWorked: todayAttendance?.hours_worked ?? null,
    overtimeHours: todayAttendance?.overtime_hours ?? 0,
  });
}
