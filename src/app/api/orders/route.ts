import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { newOrderId, customerIdFromMobile, deriveBalance, fmtNow, computeEarnPoints, computeRedemption } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";
import type { ModuleEntitlements } from "@/lib/entitlements";
import type { Json } from "@/lib/supabase/database.types";

const garmentSchema = z.object({
  type: z.string().min(1),
  lining: z.string().optional(),
  no: z.number().optional(),
  amount: z.number().optional(),
});

const bodySchema = z.object({
  name: z.string().min(1),
  mobile: z.string().min(1),
  inDate: z.string().optional().default(""),
  deliveryDate: z.string().optional().default(""),
  garments: z.array(garmentSchema).default([]),
  total: z.number().min(0),
  advance: z.number().min(0).default(0),
  tailor: z.string().optional().default(""),
  special: z.string().optional().default(""),
  measurements: z.record(z.string(), z.unknown()).optional().default({}),
  images: z.array(z.string()).optional().default([]),
  audios: z.array(z.string()).optional().default([]),
  videos: z.array(z.string()).optional().default([]),
  /** Redeem the customer's loyalty points against this order's balance at creation. */
  usePoints: z.boolean().optional().default(false),
  orderType: z.enum(["new", "alteration"]).optional().default("new"),
  paymentMethod: z.string().optional(),
});

/**
 * Order creation, ported from `_handleSave()` new-order path, Stitching_Manager_Pro_v16.html
 * ~line 16985-17020. Server-side so the loyalty rules and the "don't overwrite an existing
 * customer's loyalty data" guard (BUG-8) run atomically with the insert, and so the
 * redemption amount is computed from the customer's real balance rather than trusting the client.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.addOrder) return NextResponse.json({ error: "No permission to add orders" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const id = newOrderId();
  const userName = user.email.split("@")[0] || "user";
  const loyaltyCfg = await getLoyaltyConfig(supabase);

  // ── Loyalty redemption at creation ──────────────────────────────────────────
  // The discount reduces the BALANCE, never the total (total is the real garment cost —
  // old app comment at line ~10408). We fold it into `advance` rather than storing a
  // separate balance, because balance is always derived as total − advance everywhere
  // else; the "🎁 ₹N loyalty pts" marker in the history line is what lets
  // loyaltyDiscountOf() subtract it back out of collected revenue.
  // H4: reject advance > total before any computation — prevent silent overpayment.
  if (fd.advance > fd.total) {
    return NextResponse.json({ error: `Advance (₹${fd.advance}) cannot exceed total (₹${fd.total})` }, { status: 400 });
  }

  const cashAdvance = Math.round(fd.advance);
  let ptDiscount = 0;
  let ptsToRedeem = 0;

  if (fd.usePoints && loyaltyCfg.enabled) {
    const { data: custRow } = await supabase
      .from("customers")
      .select("loyalty_points")
      .eq("id", customerIdFromMobile(fd.mobile))
      .maybeSingle();
    const availablePoints = custRow?.loyalty_points || 0;
    const balanceBeforePoints = deriveBalance(fd.total, cashAdvance);
    const redemption = computeRedemption(availablePoints, balanceBeforePoints, loyaltyCfg);
    if (redemption.canRedeem) {
      // C1: atomically reserve loyalty points before inserting the order so two concurrent
      // orders for the same customer can't both claim the same points balance.
      const { data: reserved } = await supabase.rpc("reserve_loyalty_discount", {
        p_mobile: fd.mobile,
        p_pts_to_redeem: redemption.ptsToRedeem,
      });
      if (reserved) {
        ptDiscount = redemption.maxPtDiscount;
        ptsToRedeem = redemption.ptsToRedeem;
      }
      // If not reserved (concurrent order won the race), proceed without discount — no error.
    }
  }

  const advance = Math.min(cashAdvance + ptDiscount, fd.total);
  const balance = deriveBalance(fd.total, advance);

  const historyLine =
    `📥 Received — ${fmtNow()} by ${userName}` +
    (cashAdvance > 0 && fd.paymentMethod ? ` · 💳 ${fd.paymentMethod}` : "") +
    (ptDiscount > 0 ? ` · 🎁 ₹${ptDiscount} loyalty pts applied` : "");

  const { data: insertedRow, error: insertError } = await supabase
    .from("orders")
    .insert({
      id,
      name: fd.name,
      mobile: fd.mobile,
      in_date: fd.inDate,
      delivery_date: fd.deliveryDate,
      garments: fd.garments,
      total: fd.total,
      advance,
      balance,
      tailor: fd.tailor,
      status: "received",
      special: fd.special,
      history: [historyLine],
      measurements: fd.measurements as Json,
      images: fd.images,
      audios: fd.audios,
      videos: fd.videos,
      order_type: fd.orderType,
    })
    .select("*")
    .single();
  if (insertError || !insertedRow) return NextResponse.json({ error: insertError?.message || "Insert failed" }, { status: 500 });

  await logAction(supabase, user.email, `📋 New order created: ${fd.name}`, id, `₹${fd.total} · Tailor: ${fd.tailor}`);

  // C3: loyalty side-effects run after the order INSERT has committed. Any failure must
  // NOT propagate as HTTP 500 (client would retry and create a duplicate order). Log and
  // return a warning instead.
  // C1: redemption points were already deducted by reserve_loyalty_discount above, so we
  // skip the awardLoyaltyPoints redemption call (it would double-deduct).
  // H5: earn points on the net amount actually paid (total - ptDiscount), not gross total.
  if (loyaltyCfg.enabled) {
    try {
      if (balance === 0) {
        const netTotal = Math.max(0, fd.total - ptDiscount);
        const earnPts = computeEarnPoints(netTotal, loyaltyCfg);
        if (earnPts > 0) {
          await awardLoyaltyPoints(supabase, fd.mobile, fd.name, earnPts, "earn", id, `Order paid in full ₹${fd.total}`);
        }
      }
    } catch (loyaltyErr) {
      await logAction(supabase, user.email, `⚠️ Loyalty earn failed for ${id} — manual correction needed`, id, String(loyaltyErr));
    }
  }

  // Fix #8: guard duplicate mobile — don't overwrite an existing customer's name or loyalty data.
  // The order itself already saved successfully above, so a failure here doesn't fail the
  // request — but it must not be swallowed silently, or the customer's measurements/loyalty
  // seed record can go missing with no trace. Logged to Activity Log so it's visible.
  const { data: existingCustomer, error: lookupError } = await supabase
    .from("customers")
    .select("id, name")
    .eq("mobile", fd.mobile)
    .maybeSingle();

  let customerSyncError = lookupError?.message;
  if (!lookupError) {
    if (existingCustomer) {
      const { error } = await supabase.from("customers").update({ measurements: fd.measurements as Json }).eq("id", existingCustomer.id);
      customerSyncError = error?.message;
    } else {
      const { error } = await supabase.from("customers").insert({
        id: customerIdFromMobile(fd.mobile),
        name: fd.name,
        mobile: fd.mobile,
        measurements: fd.measurements as Json,
        loyalty_points: 0,
        total_points_earned: 0,
        loyalty_history: [],
      });
      customerSyncError = error?.message;
    }
  }
  if (customerSyncError) {
    await logAction(supabase, user.email, `⚠️ Customer record not synced for order ${id}`, id, customerSyncError);
  }

  // Soft usage-cap warning — never blocks the order, which has already been created above.
  let limitWarning: string | undefined;
  const { data: entSetting } = await supabase.from("app_settings").select("value").eq("key", "moduleEntitlements").maybeSingle();
  const maxOrders = (entSetting?.value as ModuleEntitlements | null)?.limits?.maxOrdersPerMonth;
  if (maxOrders != null) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth.toISOString());
    if (count != null && count >= maxOrders) {
      limitWarning = `You've reached your plan's order limit (${count}/${maxOrders} this month). Contact us to upgrade.`;
    }
  }

  return NextResponse.json({ order: mapOrderRow(insertedRow), ptDiscount, ptsToRedeem, limitWarning });
}
