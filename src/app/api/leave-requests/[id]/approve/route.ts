import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { mapLeaveRequestRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

/**
 * Approves a pending leave request via the approve_leave_request RPC (FOR UPDATE-locked,
 * mirrors record_order_payment/edit_order) — it atomically flips status and marks the covered
 * dates as 'leave' in employee_attendance, skipping weekly-offs/holidays and any date that
 * already has real (non-leave) attendance with a check-in.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const { data: reqRow } = await supabase.from("leave_requests").select("employee_id, from_date, to_date").eq("id", id).maybeSingle();
  if (!reqRow) return NextResponse.json({ error: "Leave request not found" }, { status: 404 });

  // Pre-check for a friendlier warning — the RPC re-checks and enforces this itself regardless,
  // this is purely so the UI can tell the approver "N day(s) already had attendance and were skipped."
  const { data: conflictRows } = await supabase
    .from("employee_attendance")
    .select("date")
    .eq("employee_id", reqRow.employee_id)
    .gte("date", reqRow.from_date)
    .lte("date", reqRow.to_date)
    .neq("status", "leave")
    .not("check_in_at", "is", null);

  const { data: updatedRows, error } = await supabase.rpc("approve_leave_request", {
    p_leave_request_id: id,
    p_decided_by: user.email,
  });
  const updated = updatedRows?.[0];
  if (error || !updated) return NextResponse.json({ error: error?.message || "Approval failed" }, { status: 500 });

  await logAction(supabase, user.email, `Leave request approved`, null, `${reqRow.from_date} to ${reqRow.to_date}`);

  return NextResponse.json({
    request: mapLeaveRequestRow(updated),
    skippedDates: (conflictRows || []).map((r) => r.date),
  });
}
