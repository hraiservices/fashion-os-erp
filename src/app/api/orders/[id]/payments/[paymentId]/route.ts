import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { fmtNow, couponDiscountOf, REFERRAL_BONUS_POINTS } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";
import { mapOrderRow } from "@/lib/types";
import { awardLoyaltyPoints } from "@/lib/loyalty";

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

  const { data: orderRow } = await supabase.from("orders").select("mobile, name, history, balance").eq("id", id).maybeSingle();
  const wasFullyPaid = orderRow?.balance === 0;

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

  // If this deletion un-completes an order that was fully paid, claw back the points it earned
  // (payment/route.ts and set-stage/route.ts both award "earn" points the moment balance hits
  // 0) — this was missing entirely: deleting the payment correctly reversed advance/balance,
  // but the earned points stayed on the customer's balance forever, redeemable on an unrelated
  // future order. Reverses under type "manual" (not "earn") so a later legitimate re-payoff of
  // this same order can still earn fresh points — award_loyalty_points' idempotency guard only
  // blocks a second POSITIVE award for the same (type, orderId), keyed on the "earn" type.
  const nowUnpaid = (updatedRows[0].balance ?? 0) > 0;
  if (wasFullyPaid && nowUnpaid && orderRow?.mobile) {
    const custId = `CUST-${orderRow.mobile}`;
    const { data: custRow } = await supabase.from("customers").select("name, loyalty_history").eq("id", custId).maybeSingle();
    const history = (custRow?.loyalty_history as Array<{ type: string; orderId: string | null; pts: number; note?: string }> | null) || [];
    const earnEntry = history.find((h) => h.type === "earn" && h.orderId === id);
    const alreadyReversed = history.some((h) => h.type === "manual" && h.orderId === id && (h.note || "").includes("Full payment reversed"));
    if (earnEntry && earnEntry.pts > 0 && !alreadyReversed) {
      await awardLoyaltyPoints(supabase, orderRow.mobile, custRow?.name || orderRow.name, -earnEntry.pts, "manual", id, "Full payment reversed — earned points clawed back");
    }
  }

  // A referral coupon's rupee value is folded into whichever payment's pt_discount was applied
  // at order creation — there's no column linking a specific order_payments row back to the
  // coupon it came from, so reversing it mid-order (while other payments remain) would be a
  // guess. Only safe to do once this deletion empties the order's entire payment ledger, which
  // mirrors what full order deletion already does for the same coupon (orders/[id]/route.ts).
  try {
    const { count: remaining } = await supabase.from("order_payments").select("id", { count: "exact", head: true }).eq("order_id", id);
    if ((remaining || 0) === 0) {
      const couponAmount = couponDiscountOf({ history: Array.isArray(orderRow?.history) ? (orderRow.history as string[]) : [] });
      if (couponAmount > 0) {
        const { data: couponRow } = await supabase.from("referral_coupons").select("code, referrer_mobile, referrer_name").eq("redeemed_order_id", id).maybeSingle();
        if (couponRow) {
          await supabase.rpc("release_referral_coupon", { p_code: couponRow.code });
          await awardLoyaltyPoints(supabase, couponRow.referrer_mobile, couponRow.referrer_name, -REFERRAL_BONUS_POINTS, "manual", id, `Referral bonus reversed — last payment on order ${id} deleted`);
        }
      }
    }
  } catch {
    await logAction(supabase, user.email, `⚠️ Referral coupon release failed after deleting a payment on ${id} — manual correction may be needed`, id);
  }

  await logAction(supabase, user.email, `↩️ Payment deleted: ₹${payment.amount} for ${id}`, id);
  return NextResponse.json({ ok: true, order: mapOrderRow(updatedRows[0]) });
}
