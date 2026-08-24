import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/**
 * Confirms the tailor payables snapshotted onto an order's garments (see
 * snapshot_tailor_payables() / set_order_stage) so they count toward payroll. Deliberately
 * gated on managePayroll, not changeStage — a tailor already holds changeStage and can move
 * their own order to "ready" (which is what triggers the snapshot), so letting that same
 * action also finalize their own pay would be a self-dealing gap. This is the second checkpoint
 * a payroll manager must clear before a piece-rate figure becomes real money owed.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to confirm tailor payables" }, { status: 403 });

  const { data: row, error: fetchError } = await supabase
    .from("orders")
    .select("id, name, ready_at, payables_confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (!row.ready_at) {
    return NextResponse.json({ error: "This order hasn't reached the ready stage yet — no tailor payables to confirm." }, { status: 409 });
  }

  // Idempotent — re-confirming an already-confirmed order is a no-op, not an error.
  if (row.payables_confirmed_at) {
    return NextResponse.json({ ok: true, confirmedAt: row.payables_confirmed_at });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("orders")
    .update({ payables_confirmed_at: now, payables_confirmed_by: user.email })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAction(supabase, user.email, `✅ Tailor payables confirmed for order ${row.name}`, id);

  return NextResponse.json({ ok: true, confirmedAt: now });
}
