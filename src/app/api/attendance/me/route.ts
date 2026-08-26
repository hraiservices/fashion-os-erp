import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";
import { istDateString } from "@/lib/ist-date";

/** Tells the check-in page who's logged in and today's attendance state, so it knows whether
 *  to show "Check in" or "Check out" (or "Done for today"). */
export async function GET() {
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const { data: employee } = await supabase.from("employees").select("id, name, role, location_id, active").eq("id", employeeId).maybeSingle();
  if (!employee || !employee.active) return NextResponse.json({ error: "Employee not found or inactive" }, { status: 404 });

  const today = istDateString();
  const yesterday = istDateString(new Date(Date.now() - 86_400_000));
  // An overnight shift checked in before midnight IST lives on YESTERDAY's row — filtering
  // strictly by `date = today` reported "not checked in" for someone mid-overnight-shift,
  // showing a "Check In" button that would have orphaned yesterday's row on tap (see
  // checkin/checkout routes). Prefer a still-open shift from either day; otherwise fall back
  // to today's (possibly already-completed) row.
  const { data: rows } = await supabase
    .from("employee_attendance")
    .select("date, check_in_at, check_out_at, hours_worked, overtime_hours")
    .eq("employee_id", employeeId)
    .in("date", [today, yesterday]);
  const openShift = (rows || []).find((r) => r.check_in_at && !r.check_out_at);
  const attendance = openShift || (rows || []).find((r) => r.date === today) || null;

  let location: { name: string; hasCoordinates: boolean } | null = null;
  if (employee.location_id) {
    const { data: loc } = await supabase.from("shop_locations").select("name").eq("id", employee.location_id).maybeSingle();
    if (loc) location = { name: loc.name, hasCoordinates: true };
  }

  return NextResponse.json({
    employee: { id: employee.id, name: employee.name, role: employee.role },
    location,
    checkedInAt: attendance?.check_in_at ?? null,
    checkedOutAt: attendance?.check_out_at ?? null,
    hoursWorked: attendance?.hours_worked ?? null,
    overtimeHours: attendance?.overtime_hours ?? 0,
  });
}
