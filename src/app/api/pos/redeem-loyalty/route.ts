import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { computeRedemption } from "@/lib/business-rules";
import { getLoyaltyConfig } from "@/lib/settings";

const bodySchema = z.object({
  mobile: z.string().min(1),
  name: z.string().min(1),
  /** The most this redemption should offset — the sale's remaining balance at the moment the
   *  cashier applies it. The actual discount granted is capped at this AND at what the
   *  customer's live point balance funds (never trust either side alone). */
  maxDiscount: z.number().positive(),
  invoiceNumber: z.string().min(1),
});

/**
 * Redeem loyalty points at POS checkout — separate from the stitching-order redemption flow
 * (reserve_loyalty_discount, used by /api/orders) because that RPC is keyed to an order id and
 * sales invoices don't have an equivalent reservation step. This recomputes both the customer's
 * live point balance and the redemption math server-side (never trusts a client-supplied ₹ or
 * pts figure — same rule as the order-creation route), then deducts the points immediately via
 * award_loyalty_points.
 *
 * Not atomic with the invoice save that follows: the points are gone the moment this call
 * succeeds, before the sale is actually completed. The POS screen treats the resulting
 * discount as a tender line the cashier can remove before checkout, which calls
 * /api/pos/undo-redeem-loyalty to hand the points back — see pos/page.tsx's
 * undoLoyaltyRedemption. A sale abandoned without using that undo (closing the tab, say) is a
 * real but narrow gap — same category of "best effort, support can manually re-credit" as other
 * non-atomic flows in this codebase — acceptable for a single-till POS.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.usePOS) return NextResponse.json({ error: "No permission to use the POS" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { mobile, name, maxDiscount, invoiceNumber } = parsed.data;

  const loyaltyCfg = await getLoyaltyConfig(supabase);
  if (!loyaltyCfg.enabled) return NextResponse.json({ error: "Loyalty points are turned off for this shop" }, { status: 400 });

  const { data: custRow, error: custError } = await db.from("customers").select("loyalty_points").eq("mobile", mobile).maybeSingle();
  if (custError) return NextResponse.json({ error: custError.message }, { status: 500 });
  const availablePoints = custRow?.loyalty_points || 0;

  const redemption = computeRedemption(availablePoints, maxDiscount, loyaltyCfg);
  if (!redemption.canRedeem || redemption.maxPtDiscount <= 0) {
    return NextResponse.json({ error: "Not enough points to redeem" }, { status: 400 });
  }

  try {
    await awardLoyaltyPoints(db, mobile, name, -redemption.ptsToRedeem, "redeem", null, `POS redeemed for ₹${redemption.maxPtDiscount} off ${invoiceNumber}`);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not redeem points" }, { status: 500 });
  }

  await logAction(supabase, user.email, `🎁 POS loyalty redemption: -${redemption.ptsToRedeem} pts (₹${redemption.maxPtDiscount}) for ${name} (${mobile}) on ${invoiceNumber}`, null, null, mobile);
  return NextResponse.json({ ok: true, discount: redemption.maxPtDiscount, ptsUsed: redemption.ptsToRedeem });
}
