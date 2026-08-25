import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { newOrderId, customerIdFromMobile, deriveBalance, fmtNow, computeEarnPoints, computeRedemption, REFERRAL_BONUS_POINTS } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";
import type { ModuleEntitlements } from "@/lib/entitlements";
import type { Json } from "@/lib/supabase/database.types";
import { DEFAULT_DOCUMENT_NUMBERING, formatDocNumber, periodKeyFor, type DocumentNumberingSettings } from "@/lib/document-numbering";

const garmentSchema = z.object({
  type: z.string().min(1),
  lining: z.string().optional(),
  no: z.number().optional(),
  amount: z.number().optional(),
  /** Per-garment production checklist (cut/stitched/finished/pressed) — see src/lib/garment-checklist.ts. */
  checklist: z.record(z.string(), z.boolean()).optional(),
  /** Employee id of whoever will stitch this garment — drives tailor piece-rate pay. */
  tailor: z.string().optional(),
  /** Stable id used to reattach a frozen payableAmount to the right garment across edits. */
  lineId: z.string().optional(),
});

const bodySchema = z.object({
  name: z.string().min(1),
  mobile: z.string().min(1),
  inDate: z.string().optional().default(""),
  deliveryDate: z.string().optional().default(""),
  inTime: z.string().optional().default(""),
  deliveryTime: z.string().optional().default(""),
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
  bookingSource: z.string().optional().default(""),
  fabricCost: z.number().min(0).optional().default(0),
  otherCost: z.number().min(0).optional().default(0),
  /** Referral coupon code to redeem against this order's balance at creation. */
  couponCode: z.string().optional(),
  expenses: z
    .array(
      z.object({
        category: z.string().min(1),
        qty: z.number().min(0).optional(),
        unit: z.string().optional(),
        rate: z.number().min(0).optional(),
        amount: z.number().min(0),
      })
    )
    .optional()
    .default([]),
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

  // Cost/profitability data is internal-only, gated to the same viewReports permission as the
  // order form's Costs section and the Order Profitability report — a caller without it can't
  // smuggle cost figures in even though the rest of the order payload is otherwise accepted.
  if (!user.perms.viewReports) {
    fd.fabricCost = 0;
    fd.otherCost = 0;
    fd.expenses = [];
  }

  // Sequential numbering (Settings > Document Numbering) — falls back to the random SOR-xxxxx
  // id when disabled. Either way this becomes the order's real primary key, so it's resolved
  // before anything else touches the row.
  let id = newOrderId();
  const { data: numberingSetting } = await supabase.from("app_settings").select("value").eq("key", "documentNumbering").maybeSingle();
  const numbering: DocumentNumberingSettings = { ...DEFAULT_DOCUMENT_NUMBERING, ...((numberingSetting?.value as Partial<DocumentNumberingSettings>) || {}) };
  const orderNumberFmt = numbering.stitchingOrder;
  if (orderNumberFmt.enabled) {
    const parsedDate = fd.inDate ? new Date(fd.inDate) : new Date();
    const year = isNaN(parsedDate.getTime()) ? new Date().getFullYear() : parsedDate.getFullYear();
    const { data: nextNumber, error: seqError } = await supabase.rpc("next_document_number", {
      p_doc_type: "stitching_order",
      p_period_key: periodKeyFor(orderNumberFmt, year),
      p_start: orderNumberFmt.startNumber,
    });
    if (seqError) return NextResponse.json({ error: seqError.message }, { status: 500 });
    id = formatDocNumber(orderNumberFmt, nextNumber, year);
  }
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
        p_order_id: id,
        p_note: `Redeemed for ₹${redemption.maxPtDiscount} discount`,
      });
      if (reserved) {
        ptDiscount = redemption.maxPtDiscount;
        ptsToRedeem = redemption.ptsToRedeem;
      }
      // If not reserved (concurrent order won the race), proceed without discount — no error.
    }
  }

  // ── Referral coupon redemption at creation ──────────────────────────────────
  // Same shape as loyalty redemption above: reserve atomically before the order exists (the
  // discount must be known to compute advance/balance below), release on insert failure.
  let couponDiscount = 0;
  let redeemedCouponCode: string | null = null;
  let couponReferrerMobile: string | null = null;
  let couponReferrerName: string | null = null;
  if (fd.couponCode?.trim()) {
    const code = fd.couponCode.trim().toUpperCase();
    const { data: redeemedRows, error: couponError } = await supabase.rpc("redeem_referral_coupon", { p_code: code, p_order_id: id });
    if (couponError) {
      const msg = couponError.message.includes("COUPON_NOT_FOUND")
        ? "That coupon code wasn't found"
        : couponError.message.includes("COUPON_ALREADY_REDEEMED")
          ? "That coupon has already been used"
          : couponError.message.includes("COUPON_EXPIRED")
            ? "That coupon has expired"
            : couponError.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const redeemed = redeemedRows?.[0];
    if (redeemed) {
      couponDiscount = redeemed.discount_amount || 0;
      redeemedCouponCode = redeemed.code;
      couponReferrerMobile = redeemed.referrer_mobile;
      couponReferrerName = redeemed.referrer_name;
    }
  }

  const advance = Math.min(cashAdvance + ptDiscount + couponDiscount, fd.total);
  const balance = deriveBalance(fd.total, advance);

  const historyLine =
    `📥 Received — ${fmtNow()} by ${userName}` +
    (cashAdvance > 0 && fd.paymentMethod ? ` · 💳 ${fd.paymentMethod}` : "") +
    (ptDiscount > 0 ? ` · 🎁 ₹${ptDiscount} loyalty pts applied` : "") +
    (couponDiscount > 0 ? ` · 🎟️ ₹${couponDiscount} referral coupon applied` : "");

  const { data: insertedRow, error: insertError } = await supabase
    .from("orders")
    .insert({
      id,
      name: fd.name,
      mobile: fd.mobile,
      in_date: fd.inDate,
      delivery_date: fd.deliveryDate,
      in_time: fd.inTime || null,
      delivery_time: fd.deliveryTime || null,
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
      booking_source: fd.bookingSource,
      fabric_cost: fd.fabricCost,
      other_cost: fd.otherCost,
    })
    .select("*")
    .single();
  if (insertError || !insertedRow) {
    // Points were already deducted by reserve_loyalty_discount above. The order does not
    // exist, so nothing will ever consume that discount — hand the points back, otherwise
    // a failed insert silently burns the customer's balance.
    if (ptsToRedeem > 0) {
      await supabase.rpc("refund_loyalty_discount", {
        p_mobile: fd.mobile,
        p_pts: ptsToRedeem,
        p_order_id: id,
        p_note: "Order creation failed — redemption reversed",
      });
    }
    // Same reasoning for a reserved-but-now-orphaned referral coupon.
    if (redeemedCouponCode) {
      await supabase.rpc("release_referral_coupon", { p_code: redeemedCouponCode });
    }
    return NextResponse.json({ error: insertError?.message || "Insert failed" }, { status: 500 });
  }

  let paymentLedgerWarning: string | undefined;
  // An order can start with a nonzero advance paid at booking, entirely separate from the
  // dedicated payment route (record_order_payment) — without this, every order created with an
  // upfront advance would have that money sitting in orders.advance with no ledger row behind
  // it, the exact gap order_payments exists to close. Same non-atomic-child-insert reasoning as
  // stitching expenses below: a failure here doesn't fail the whole request (the order and its
  // real advance/balance already exist), just gets logged.
  if (advance > 0) {
    const { error: paymentError } = await supabase.from("order_payments").insert({
      order_id: id,
      amount: cashAdvance,
      pt_discount: ptDiscount + couponDiscount,
      pts_redeemed: ptsToRedeem,
      method: fd.paymentMethod || "Cash",
      note: "Initial advance at booking",
      created_by: user.email,
    });
    if (paymentError) {
      await logAction(supabase, user.email, `⚠️ Initial advance payment record not saved for order ${id}`, id, paymentError.message);
      // Must be surfaced, not just logged. The order and its advance already exist, so failing
      // the request would be wrong — but staying silent leaves money recorded in orders.advance
      // with no ledger row: invisible in the Payments section, undeletable, and blocking the
      // order from ever being deleted. The user has to know to re-record it.
      paymentLedgerWarning = `Order saved, but the ₹${cashAdvance} advance could not be recorded in the payments ledger. Open the order and add the payment again, or it won't appear in payment reports.`;
    }
  }

  // Stitching expenses attach to the order id that was just assigned above — can't be inserted
  // atomically with the order itself (separate table), but a failure here doesn't fail the
  // whole request since the order already exists; logged instead, same pattern as the
  // customer-sync step below.
  if (fd.expenses.length > 0) {
    const { error: expensesError } = await supabase.from("order_expenses").insert(
      fd.expenses.map((e) => ({
        order_id: id,
        category: e.category,
        qty: e.qty ?? null,
        unit: e.unit ?? null,
        rate: e.rate ?? null,
        amount: e.amount,
        created_by: user.email,
      }))
    );
    if (expensesError) {
      await logAction(supabase, user.email, `⚠️ Stitching expenses not saved for order ${id}`, id, expensesError.message);
    }
  }

  // fd.tailor is now an employee id, not a name — dropped from this detail string rather than
  // resolved (would need an extra query for a cosmetic log line); the order's own detail page
  // already shows the tailor's name.
  await logAction(supabase, user.email, `📋 New order created: ${fd.name}`, id, `₹${fd.total}`);

  // C3: loyalty side-effects run after the order INSERT has committed. Any failure must
  // NOT propagate as HTTP 500 (client would retry and create a duplicate order). Log and
  // return a warning instead.
  // C1: redemption points were already deducted by reserve_loyalty_discount above, so we
  // skip the awardLoyaltyPoints redemption call (it would double-deduct).
  // H5: earn points on the net amount actually paid (total - ptDiscount - couponDiscount), not gross total.
  if (loyaltyCfg.enabled) {
    try {
      if (balance === 0) {
        const netTotal = Math.max(0, fd.total - ptDiscount - couponDiscount);
        const earnPts = computeEarnPoints(netTotal, loyaltyCfg);
        if (earnPts > 0) {
          await awardLoyaltyPoints(supabase, fd.mobile, fd.name, earnPts, "earn", id, `Order paid in full ₹${fd.total}`);
        }
      }
    } catch (loyaltyErr) {
      await logAction(supabase, user.email, `⚠️ Loyalty earn failed for ${id} — manual correction needed`, id, String(loyaltyErr));
    }
  }

  // Referral bonus — credited to whoever issued the coupon, independent of the loyalty program
  // toggle above (a referral reward is a separate mechanic from points-per-rupee-spent).
  if (couponReferrerMobile) {
    try {
      await awardLoyaltyPoints(supabase, couponReferrerMobile, couponReferrerName || "", REFERRAL_BONUS_POINTS, "referral", id, `Referral coupon redeemed by ${fd.name}`);
    } catch (referralErr) {
      await logAction(supabase, user.email, `⚠️ Referral bonus failed for ${id} — manual correction needed`, id, String(referralErr));
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

  return NextResponse.json({ order: mapOrderRow(insertedRow), ptDiscount, ptsToRedeem, limitWarning, paymentLedgerWarning });
}
