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
 * for every other pre-existing order. Refuses if a payment row already exists, so this can't be
 * used to double-count a real payment.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayments) return NextResponse.json({ error: "No permission to manage payments" }, { status: 403 });

  const { data: order } = await supabase.from("orders").select("id, advance").eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if ((order.advance || 0) <= 0) return NextResponse.json({ error: "This order has no advance to backfill" }, { status: 400 });

  const { count } = await supabase.from("order_payments").select("id", { count: "exact", head: true }).eq("order_id", id);
  if ((count || 0) > 0) return NextResponse.json({ error: "This order already has payment records" }, { status: 409 });

  const { error } = await supabase.from("order_payments").insert({
    order_id: id,
    amount: order.advance,
    pt_discount: 0,
    pts_redeemed: 0,
    method: "Other",
    note: "Backfilled — recorded before the payment ledger existed",
    created_by: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Payment ledger backfilled for order ${id}`, id, `₹${order.advance}`);
  return NextResponse.json({ ok: true });
}
