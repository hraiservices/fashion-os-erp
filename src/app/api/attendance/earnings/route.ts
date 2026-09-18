import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";
import { istDateString } from "@/lib/ist-date";

interface GarmentLike {
  tailor?: string;
  payableAmount?: number;
}

/** The logged-in tailor's own piece-rate earnings — self-service visibility into a running
 *  total, same PIN-session auth pattern as /api/attendance/leave-balance. There's no manager
 *  confirmation step — a garment payable counts as soon as its order is Received and a tailor
 *  is assigned (the shop pays the tailor regardless of whether the customer has paid), and
 *  stays live until actually paid out by a payroll run — see unfreeze_tailor_payables_at_ready.sql
 *  / remove_tailor_payable_confirm_step.sql. */
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
    supabase.from("orders").select("garments, in_date"),
    supabase.from("work_orders").select("tailor, labor_cost, completed_at").eq("tailor", employeeId).not("completed_at", "is", null),
  ]);

  let weekTotal = 0;
  let monthTotal = 0;
  let allTimeTotal = 0;

  for (const row of orderRows || []) {
    const garments = Array.isArray(row.garments) ? (row.garments as GarmentLike[]) : [];
    const myPayable = garments.filter((g) => g.tailor === employeeId).reduce((s, g) => s + (g.payableAmount || 0), 0);
    if (myPayable <= 0) continue;
    allTimeTotal += myPayable;
    if (row.in_date && row.in_date >= weekStart) weekTotal += myPayable;
    if (row.in_date && row.in_date >= monthStart) monthTotal += myPayable;
  }

  for (const wo of woRows || []) {
    const amount = wo.labor_cost || 0;
    if (amount <= 0) continue;
    allTimeTotal += amount;
    if (wo.completed_at && wo.completed_at >= weekStart) weekTotal += amount;
    if (wo.completed_at && wo.completed_at >= monthStart) monthTotal += amount;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    eligible: true,
    weekTotal: round2(weekTotal),
    monthTotal: round2(monthTotal),
    allTimeTotal: round2(allTimeTotal),
  });
}
