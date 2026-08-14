import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";

/** Last 14 days of the logged-in employee's own attendance — lets them see their own history
 *  without needing manager access to the main app. */
export async function GET() {
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const { data } = await supabase
    .from("employee_attendance")
    .select("date, status, check_in_at, check_out_at, hours_worked, overtime_hours")
    .eq("employee_id", employeeId)
    .order("date", { ascending: false })
    .limit(14);

  return NextResponse.json({
    days: (data || []).map((r) => ({
      date: r.date,
      status: r.status,
      checkInAt: r.check_in_at,
      checkOutAt: r.check_out_at,
      hoursWorked: r.hours_worked,
      overtimeHours: r.overtime_hours,
    })),
  });
}
