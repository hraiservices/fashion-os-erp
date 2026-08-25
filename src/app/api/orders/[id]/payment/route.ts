import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { computeRedemption, computeEarnPoints, loyaltyDiscountOf, couponDiscountOf, fmtNow, customerIdFromMobile, ORDER_PAYMENT_METHODS as PAYMENT_METHODS } from "@/lib/business-rules";
// customerIdFromMobile retained for loyalty lookup below
import { logAction } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";

const bodySchema = z.object({
  amount: z.number().min(0),
  payMethod: z.enum(PAYMENT_METHODS),
  note: z.string().max(500).optional(),
  usePoints: z.boolean().optional(),
  /** The advance the client last saw, for the same reason edit_order's p_expected_advance
   *  exists — if a payment already landed since, reject rather than silently double-apply. */
  expectedAdvance: z.number().optional(),
});

/** Discount markers ("🎁 ₹500", "🎟️ ₹100") are recovered from history lines by regex
 *  (loyaltyDiscountOf/couponDiscountOf) — a free-text note or payment method could otherwise
 *  forge one of these markers and corrupt reported revenue, or, via the delete-refund fallback
 *  in src/app/api/orders/[id]/route.ts, mint loyalty points from nothing. Strip anything that
 *  could be mistaken for a marker before it ever reaches the history line. */
function sanitizeHistoryText(s: string): string {
  return s.replace(/[🎁🎟️₹]/g, "").trim();
}

/**
 * Payment collection, ported from PaymentModal.doSave(), Stitching_Manager_Pro_v16.html
 * ~line 4183, and the earn-on-full-payment rule at ~line 17102. Server-side so the
 * redemption math and the "earn points exactly once" guarantee can't be tampered with
 * from the client, and so the redeem + earn RPC calls happen in the same request.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayments) return NextResponse.json({ error: "No permission to manage payments" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { amount, payMethod, note, usePoints, expectedAdvance } = parsed.data;
  const safeNote = note ? sanitizeHistoryText(note) : "";

  const { data: row, error: fetchError } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const order = mapOrderRow(row);

  const loyaltyCfg = await getLoyaltyConfig(supabase);
  const { data: custRow } = await supabase
    .from("customers")
    .select("loyalty_points")
    .eq("id", customerIdFromMobile(order.mobile))
    .maybeSingle();
  const availablePoints = loyaltyCfg.enabled ? custRow?.loyalty_points || 0 : 0;

  const redemption = usePoints ? computeRedemption(availablePoints, order.balance, loyaltyCfg) : { canRedeem: false, maxPtDiscount: 0, ptsToRedeem: 0 };
  const cashPaid = Math.round(amount);
  if (!cashPaid && !redemption.canRedeem) return NextResponse.json({ error: "Enter an amount or redeem points" }, { status: 400 });

  // Reserve the loyalty discount BEFORE the payment RPC (same reason order creation reserves
  // before inserting the order): the balance-and-deduct has to be atomic against a second
  // concurrent payment for the same customer reading the same starting points balance and
  // both being granted the full discount, which the old read-in-JS-then-deduct-after-the-fact
  // shape couldn't prevent. Points are deducted here, not after — if the payment RPC itself
  // then rejects (stale advance, below), the reservation is released.
  let ptDiscount = 0;
  let ptsToRedeem = 0;
  if (usePoints && redemption.canRedeem) {
    const { data: reserved } = await supabase.rpc("reserve_loyalty_discount", {
      p_mobile: order.mobile,
      p_pts_to_redeem: redemption.ptsToRedeem,
      p_order_id: id,
      p_note: `Redeemed for ₹${redemption.maxPtDiscount} discount`,
    });
    if (reserved) {
      ptDiscount = redemption.maxPtDiscount;
      ptsToRedeem = redemption.ptsToRedeem;
    }
    // If not reserved (concurrent request won the race, or balance changed), proceed with
    // cash-only — no error, matching order creation's same "silently skip the discount" choice.
  }

  const historyLine =
    `💰 Payment ₹${cashPaid} via ${payMethod}` +
    (ptDiscount > 0 ? ` + 🎁 ₹${ptDiscount} loyalty pts` : "") +
    (safeNote ? ` — ${safeNote}` : "") +
    ` — ${fmtNow()}`;

  // Atomic: advance/balance/status/history are all read-modified-written in a single SQL
  // UPDATE (see record_order_payment migration) so two concurrent payments on the same order
  // can't race and silently drop one — Postgres row-locks the row for the duration, and
  // p_expected_advance rejects the whole request outright if a payment already landed since
  // the client last saw this order (a retried submit on a slow connection, or two staff
  // acting on the same order at once).
  const { data: updatedRows, error: updateError } = await supabase.rpc("record_order_payment", {
    p_order_id: id,
    p_cash_paid: cashPaid,
    p_pt_discount: ptDiscount,
    p_history_line: historyLine,
    p_expected_advance: expectedAdvance ?? null,
    p_method: payMethod,
    p_note: safeNote,
    p_created_by: user.email,
    p_pts_redeemed: ptsToRedeem,
  });
  const updatedRow = updatedRows?.[0];
  if (updateError || !updatedRow) {
    // The reservation above already deducted points — the payment never landed, so hand them
    // back rather than silently burning the customer's balance (mirrors order creation's
    // insert-failure refund).
    if (ptsToRedeem > 0) {
      await supabase.rpc("refund_loyalty_discount", {
        p_mobile: order.mobile,
        p_pts: ptsToRedeem,
        p_order_id: id,
        p_note: "Payment failed — redemption reversed",
      });
    }
    if (updateError?.message?.includes("STALE_ADVANCE")) {
      return NextResponse.json(
        { error: "A payment was already recorded for this order. Reload the page and try again." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: updateError?.message || "Update failed" }, { status: 500 });
  }
  const newBalance = updatedRow.balance;
  const isFullyPaid = newBalance === 0;

  await logAction(
    supabase,
    user.email,
    `💰 Payment ₹${cashPaid} via ${payMethod}${ptDiscount > 0 ? ` + ₹${ptDiscount} pts` : ""} collected for ${id}`,
    id,
    `Balance: ₹${newBalance}`
  );

  // H7: the earn-points award below runs after the payment is already committed in the DB.
  // Wrap in try/catch — a loyalty RPC failure must not return HTTP 500 here (the payment
  // is real and the client cache must be invalidated). Log for manual correction.
  // H5: earn on net total (total - any loyalty discount already applied to this order).
  // Redemption points were already deducted by reserve_loyalty_discount above — no separate
  // awardLoyaltyPoints(..., "redeem", ...) call here, it would double-deduct.
  try {
    if (isFullyPaid && loyaltyCfg.enabled) {
      // `order` was read before record_order_payment ran, so its history does not yet
      // contain this payment's own discount line — add ptDiscount explicitly or the
      // customer earns points on money they never paid. Also excludes any referral-coupon
      // discount already applied to this order, same "not real cash" treatment.
      const priorDiscount = loyaltyDiscountOf(order) + couponDiscountOf(order) + ptDiscount;
      const netTotal = Math.max(0, order.total - priorDiscount);
      const earnPts = computeEarnPoints(netTotal, loyaltyCfg);
      if (earnPts > 0) {
        await awardLoyaltyPoints(supabase, order.mobile, order.name, earnPts, "earn", id, `Full payment received ₹${order.total}`);
      }
    }
  } catch (loyaltyErr) {
    await logAction(supabase, user.email, `⚠️ Loyalty award failed for payment on ${id} — manual correction needed`, id, String(loyaltyErr));
  }

  return NextResponse.json({ order: mapOrderRow(updatedRow) });
}
