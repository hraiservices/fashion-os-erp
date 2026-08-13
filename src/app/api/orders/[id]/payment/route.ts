import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { computeRedemption, computeEarnPoints, loyaltyDiscountOf, fmtNow, customerIdFromMobile } from "@/lib/business-rules";
// customerIdFromMobile retained for loyalty lookup below
import { logAction } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";

const bodySchema = z.object({
  amount: z.number().min(0),
  payMethod: z.string().min(1),
  note: z.string().optional(),
  usePoints: z.boolean().optional(),
});

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
  const { amount, payMethod, note, usePoints } = parsed.data;

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
  const ptDiscount = usePoints && redemption.canRedeem ? redemption.maxPtDiscount : 0;

  const cashPaid = Math.round(amount);
  if (!cashPaid && !ptDiscount) return NextResponse.json({ error: "Enter an amount or redeem points" }, { status: 400 });

  const historyLine =
    `💰 Payment ₹${cashPaid} via ${payMethod}` +
    (ptDiscount > 0 ? ` + 🎁 ₹${ptDiscount} loyalty pts` : "") +
    (note ? ` — ${note}` : "") +
    ` — ${fmtNow()}`;

  // Atomic: advance/balance/status/history are all read-modified-written in a single SQL
  // UPDATE (see record_order_payment migration) so two concurrent payments on the same
  // order can't race and silently drop one — Postgres row-locks the row for the duration.
  const { data: updatedRows, error: updateError } = await supabase.rpc("record_order_payment", {
    p_order_id: id,
    p_cash_paid: cashPaid,
    p_pt_discount: ptDiscount,
    p_history_line: historyLine,
  });
  const updatedRow = updatedRows?.[0];
  if (updateError || !updatedRow) return NextResponse.json({ error: updateError?.message || "Update failed" }, { status: 500 });
  const newBalance = updatedRow.balance;
  const isFullyPaid = newBalance === 0;

  await logAction(
    supabase,
    user.email,
    `💰 Payment ₹${cashPaid}${ptDiscount > 0 ? ` + ₹${ptDiscount} pts` : ""} collected for ${id}`,
    id,
    `Balance: ₹${newBalance}`
  );

  // H7: loyalty calls run after the payment is already committed in the DB.
  // Wrap in try/catch — a loyalty RPC failure must not return HTTP 500 here (the payment
  // is real and the client cache must be invalidated). Log for manual correction.
  // H5: earn on net total (total - any loyalty discount already applied to this order).
  try {
    if (ptDiscount > 0 && redemption.ptsToRedeem > 0) {
      await awardLoyaltyPoints(supabase, order.mobile, order.name, -redemption.ptsToRedeem, "redeem", id, `Redeemed for ₹${ptDiscount} discount`);
    }
    if (isFullyPaid && loyaltyCfg.enabled) {
      // `order` was read before record_order_payment ran, so its history does not yet
      // contain this payment's own discount line — add ptDiscount explicitly or the
      // customer earns points on money they never paid.
      const priorDiscount = loyaltyDiscountOf(order) + ptDiscount;
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
