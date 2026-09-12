import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

/**
 * Confirms the tailor payables on an order's garments so they count toward payroll. Deliberately
 * gated on managePayroll, not changeStage — a tailor already holds changeStage and can move
 * their own order to "ready", so letting that same action also finalize their own pay would be
 * a self-dealing gap. This is the second checkpoint a payroll manager must clear before a
 * piece-rate figure becomes real money owed.
 *
 * Confirmable at any stage, not just "ready" (see add_early_tailor_payables.sql) — a garment's
 * payableAmount is now live-recalculated from the rate card as soon as a tailor is assigned,
 * not just once it's finished, so a manager can confirm as early as Received. Confirming is
 * itself the freeze point: the recalc trigger stops touching garments the instant
 * payables_confirmed_at is set, exactly like reaching "ready" already did.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to confirm tailor payables" }, { status: 403 });

  // orders is read-scoped for `authenticated` (lockdown_reads_per_row.sql) and managePayroll is
  // not one of the permissions that opens it, so this lookup has to use the service client. The
  // managePayroll check above is the authority.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: row, error: fetchError } = await db
    .from("orders")
    .select("id, name, garments, payables_confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const hasPayable = Array.isArray(row.garments) && row.garments.some((g) => (g as { payableAmount?: number })?.payableAmount != null);
  if (!hasPayable) {
    return NextResponse.json({ error: "No tailor is assigned to this order yet — nothing to confirm." }, { status: 409 });
  }

  // Idempotent — re-confirming an already-confirmed order is a no-op, not an error.
  if (row.payables_confirmed_at) {
    return NextResponse.json({ ok: true, confirmedAt: row.payables_confirmed_at });
  }

  // Routed through the SECURITY DEFINER RPC, not a plain update — the confirmation columns are
  // trigger-guarded (add_piece_rate_p0_fixes.sql) against direct writes, including from this
  // route's own client, so this is the only path that can actually set them. Called via the
  // service client, not the caller's own session client — the RPC is service_role-only
  // (lockdown_confirm_payable_rpcs.sql), so this route's managePayroll check above is the only
  // gate, not a client-reachable RPC grant.
  const { data: updatedRows, error: updateError } = await db.rpc("confirm_order_payables", {
    p_order_id: id,
    p_user_email: user.email,
  });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  const confirmedAt = updatedRows?.[0]?.payables_confirmed_at || new Date().toISOString();

  await logAction(supabase, user.email, `✅ Tailor payables confirmed for order ${row.name}`, id);

  return NextResponse.json({ ok: true, confirmedAt });
}
