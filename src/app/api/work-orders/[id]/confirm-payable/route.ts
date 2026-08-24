import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/**
 * Confirms a completed work order's laborCost as a real tailor payable — gated managePayroll,
 * deliberately separate from manageManufacturing (which gates completing the work order
 * itself). A tailor holding manageManufacturing can complete their own work order today, so
 * letting that same action also finalize their own pay would be a self-dealing gap. Payroll
 * aggregation only ever counts confirmed work orders — see src/lib/piece-rate.ts.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to confirm tailor payables" }, { status: 403 });

  const { data: row, error: fetchError } = await supabase
    .from("work_orders")
    .select("id, wo_number, status, labor_payable_confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  if (row.status !== "completed") {
    return NextResponse.json({ error: "This work order hasn't been completed yet — no payable to confirm." }, { status: 409 });
  }

  if (row.labor_payable_confirmed_at) {
    return NextResponse.json({ ok: true, confirmedAt: row.labor_payable_confirmed_at });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("work_orders")
    .update({ labor_payable_confirmed_at: now, labor_payable_confirmed_by: user.email })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAction(supabase, user.email, `✅ Tailor payable confirmed for work order ${row.wo_number}`);

  return NextResponse.json({ ok: true, confirmedAt: now });
}
