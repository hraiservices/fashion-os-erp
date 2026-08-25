import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { fmtNow } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";
import { mapOrderRow } from "@/lib/types";

/**
 * Delete a single stitching-order payment. Mirrors src/app/api/sales/payments/[id]/route.ts,
 * except orders.advance/balance are cached (not derived live like sales_invoices' balance), so
 * this has to explicitly reverse them via delete_order_payment() rather than just deleting the
 * row and letting a live SUM recompute.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const { id, paymentId } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayments) return NextResponse.json({ error: "No permission to delete payments" }, { status: 403 });

  const { data: payment } = await supabase
    .from("order_payments")
    .select("amount, pt_discount, pts_redeemed, order_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment || payment.order_id !== id) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  const { data: orderRow } = await supabase.from("orders").select("mobile").eq("id", id).maybeSingle();

  const historyLine = `↩️ Payment reversed: ₹${payment.amount}${payment.pt_discount > 0 ? ` + ₹${payment.pt_discount} pts` : ""} — ${fmtNow()} by ${user.email}`;

  const { data: updatedRows, error } = await supabase.rpc("delete_order_payment", {
    p_payment_id: paymentId,
    p_history_line: historyLine,
  });
  if (error || !updatedRows?.[0]) return NextResponse.json({ error: error?.message || "Delete failed" }, { status: 500 });

  // Refund the exact points redeemed as part of this payment, if any — same compensating-action
  // pattern already used when a payment insert itself fails (payment/route.ts).
  if (payment.pts_redeemed > 0 && orderRow?.mobile) {
    await supabase.rpc("refund_loyalty_discount", {
      p_mobile: orderRow.mobile,
      p_pts: payment.pts_redeemed,
      p_order_id: id,
      p_note: "Payment deleted — redemption reversed",
    });
  }

  await logAction(supabase, user.email, `↩️ Payment deleted: ₹${payment.amount} for ${id}`, id);
  return NextResponse.json({ ok: true, order: mapOrderRow(updatedRows[0]) });
}
