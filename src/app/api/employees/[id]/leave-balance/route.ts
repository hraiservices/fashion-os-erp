import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { mapLeaveTypeRow, mapLeaveBalanceAdjustmentRow, mapLeaveRequestRow } from "@/lib/types";
import { computeLeaveBalances } from "@/lib/leave";

/** Per-type leave balance for one employee/year — allocated/carried-forward/adjusted/used/remaining.
 *  "used" is derived from approved leave_requests, never a stored counter. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const yearParam = new URL(request.url).searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  const [{ data: leaveTypeRows }, { data: balanceRows }, { data: adjustmentRows }, { data: requestRows }] = await Promise.all([
    supabase.from("leave_types").select("*").eq("active", true).order("name"),
    supabase.from("leave_balances").select("leave_type_id, allocated_days, carried_forward_days").eq("employee_id", id).eq("year", year),
    supabase.from("leave_balance_adjustments").select("*").eq("employee_id", id).eq("year", year),
    supabase.from("leave_requests").select("*").eq("employee_id", id).eq("status", "approved").gte("from_date", `${year}-01-01`).lte("from_date", `${year}-12-31`),
  ]);

  const summary = computeLeaveBalances(
    (leaveTypeRows || []).map(mapLeaveTypeRow),
    (balanceRows || []).map((r) => ({ leaveTypeId: r.leave_type_id, allocatedDays: r.allocated_days, carriedForwardDays: r.carried_forward_days })),
    (adjustmentRows || []).map(mapLeaveBalanceAdjustmentRow),
    (requestRows || []).map(mapLeaveRequestRow)
  );

  return NextResponse.json({ year, balances: summary });
}
