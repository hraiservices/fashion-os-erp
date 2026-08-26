import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/**
 * Creates a single order_payments row for an order's EXISTING advance when it has none —
 * orders created before the payment ledger existed (or whose booking-advance insert silently
 * failed, see the warning surfaced at order-creation time) show a real ₹X paid with no ledger
 * row behind it: invisible in payment reports, and — since the delete-order guard checks
 * order_payments, not just advance — impossible to ever clear via the normal "delete the
 * payment, then delete the order" path.
 *
 * Deliberately does NOT touch orders.advance/balance — that figure is already correct and
 * already accounted for; this only backfills the missing ledger entry so it becomes visible
 * and deletable, exactly like the one-time migration (backfill_order_payments.sql) already did
 * for every other pre-existing order.
 *
 * Routed through the backfill_order_payment() RPC (fix_payment_ledger_p0_bugs.sql), which
 * row-locks the order before checking/inserting — a plain check-then-insert here (two separate
 * round trips) let a double-click or two open tabs both read "no existing payments" and both
 * insert, permanently duplicating the ledger row for the same advance with no way to reconcile
 * it back down.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayments) return NextResponse.json({ error: "No permission to manage payments" }, { status: 403 });

  const { data: paymentId, error } = await supabase.rpc("backfill_order_payment", {
    p_order_id: id,
    p_created_by: user.email,
  });
  if (error) {
    const status = error.message.includes("not found") ? 404 : error.message.includes("already has payment records") ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  await logAction(supabase, user.email, `Payment ledger backfilled for order ${id}`, id, `payment ${paymentId}`);
  return NextResponse.json({ ok: true });
}
