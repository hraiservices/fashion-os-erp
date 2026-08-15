import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";

/** An employee can only cancel their OWN request, and only while it's still pending — approved
 *  leave has already written attendance rows and must be reversed by an admin instead. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("employee_id", employeeId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Request not found, not yours, or no longer pending" }, { status: 409 });

  return NextResponse.json({ ok: true });
}
