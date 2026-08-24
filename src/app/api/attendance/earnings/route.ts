import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";
import { istDateString } from "@/lib/ist-date";

interface GarmentLike {
  tailor?: string;
  payableAmount?: number;
}

/** The logged-in tailor's own piece-rate earnings — self-service visibility into a running
 *  total, same PIN-session auth pattern as /api/attendance/leave-balance. "Confirmed" figures
 *  are real (a payroll manager has signed off); "pending" is shown separately and labeled as
 *  such so it's never mistaken for money already owed for certain — see the confirm-payables /
 *  confirm-payable routes for why that distinction exists. */
export async function GET() {
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const { data: employee } = await supabase.from("employees").select("piece_rate_eligible").eq("id", employeeId).maybeSingle();
  if (!employee?.piece_rate_eligible) return NextResponse.json({ eligible: false });

  const today = istDateString();
  const weekStart = istDateString(new Date(Date.now() - 6 * 86_400_000));
  const monthStart = `${today.slice(0, 7)}-01`;

  const [{ data: orderRows }, { data: woRows }] = await Promise.all([
    supabase.from("orders").select("garments, ready_at, payables_confirmed_at").not("ready_at", "is", null),
    supabase.from("work_orders").select("tailor, labor_cost, completed_at, labor_payable_confirmed_at").eq("tailor", employeeId).not("completed_at", "is", null),
  ]);

  let weekConfirmed = 0;
  let monthConfirmed = 0;
  let allTimeConfirmed = 0;
  let pending = 0;

  for (const row of orderRows || []) {
    const garments = Array.isArray(row.garments) ? (row.garments as GarmentLike[]) : [];
    const myPayable = garments.filter((g) => g.tailor === employeeId).reduce((s, g) => s + (g.payableAmount || 0), 0);
    if (myPayable <= 0) continue;
    if (row.payables_confirmed_at) {
      allTimeConfirmed += myPayable;
      if (row.ready_at && row.ready_at >= weekStart) weekConfirmed += myPayable;
      if (row.ready_at && row.ready_at >= monthStart) monthConfirmed += myPayable;
    } else {
      pending += myPayable;
    }
  }

  for (const wo of woRows || []) {
    const amount = wo.labor_cost || 0;
    if (amount <= 0) continue;
    if (wo.labor_payable_confirmed_at) {
      allTimeConfirmed += amount;
      if (wo.completed_at && wo.completed_at >= weekStart) weekConfirmed += amount;
      if (wo.completed_at && wo.completed_at >= monthStart) monthConfirmed += amount;
    } else {
      pending += amount;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    eligible: true,
    weekConfirmed: round2(weekConfirmed),
    monthConfirmed: round2(monthConfirmed),
    pendingConfirmation: round2(pending),
    allTimeConfirmed: round2(allTimeConfirmed),
  });
}
