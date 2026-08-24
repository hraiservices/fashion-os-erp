import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { fmtNow, loyaltyDiscountOf, couponDiscountOf, customerIdFromMobile, REFERRAL_BONUS_POINTS } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";
import type { Json } from "@/lib/supabase/database.types";

const garmentSchema = z.object({
  type: z.string().min(1),
  lining: z.string().optional(),
  no: z.number().optional(),
  amount: z.number().optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
  tailor: z.string().optional(),
  // Stable id preserve_garment_payables() matches on to reattach a frozen payableAmount to the
  // right garment even if lines are reordered/deleted during this edit.
  lineId: z.string().optional(),
  // Accepted here only so TS/zod don't choke on the order-form echoing back a garment's
  // existing payableAmount — the value itself is never trusted. edit_order's
  // preserve_garment_payables() strips whatever the client sends and re-attaches the row's
  // own prior value (matched by lineId, falling back to position for legacy garments), so
  // this field can only ever really be set by snapshot_tailor_payables() inside
  // set_order_stage, never by an edit.
  payableAmount: z.number().optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  mobile: z.string().min(1).optional(),
  inDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  inTime: z.string().optional(),
  deliveryTime: z.string().optional(),
  garments: z.array(garmentSchema).optional(),
  total: z.number().min(0).optional(),
  advance: z.number().min(0).optional(),
  tailor: z.string().optional(),
  special: z.string().optional(),
  measurements: z.record(z.string(), z.unknown()).optional(),
  images: z.array(z.string()).optional(),
  audios: z.array(z.string()).optional(),
  videos: z.array(z.string()).optional(),
  orderType: z.enum(["new", "alteration"]).optional(),
  bookingSource: z.string().optional(),
  fabricCost: z.number().min(0).optional(),
  otherCost: z.number().min(0).optional(),
  /**
   * The `advance` value the client was showing when the edit form was opened. Sent only
   * when the caller intends to change advance. If a payment landed in the meantime the
   * stored advance no longer matches and edit_order aborts rather than overwriting it.
   */
  expectedAdvance: z.number().optional(),
});

/**
 * PATCH — full order edit. Server-side so:
 *   • user.perms.editOrder is enforced (C4 — useUpdateOrder previously bypassed this)
 *   • userEmail comes from the server session, not the client body (H3 — impersonation fix)
 *   • all fields updated in one atomic SQL call via edit_order() RPC (C5 — history TOCTOU fix)
 *   • server timestamp used in history line (M8 — client timestamp manipulation fix)
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.editOrder) return NextResponse.json({ error: "No permission to edit orders" }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const patch = parsed.data;

  const financialSubmitted = patch.total !== undefined || patch.advance !== undefined;
  let historyLine: string | null = null;

  if (financialSubmitted) {
    const { data: cur } = await supabase.from("orders").select("total,advance").eq("id", id).maybeSingle();
    const curTotal   = cur?.total   ?? 0;
    const curAdvance = cur?.advance ?? 0;
    const newTotal   = patch.total   ?? curTotal;
    const newAdvance = patch.advance ?? curAdvance;
    if (newAdvance > newTotal) {
      return NextResponse.json({ error: `Advance (₹${newAdvance}) cannot exceed total (₹${newTotal})` }, { status: 400 });
    }
    // Only append a history line when the numbers actually moved. The edit form submits
    // total/advance on every save, so writing unconditionally would spam the audit trail
    // with "Total ₹2000→₹2000" entries on unrelated edits (e.g. fixing a name typo).
    if (newTotal !== curTotal || newAdvance !== curAdvance) {
      const userName = user.email.split("@")[0] || "user";
      historyLine = `✏️ Edited — Total ₹${curTotal}→₹${newTotal}, Advance ₹${curAdvance}→₹${newAdvance} by ${userName} — ${fmtNow()}`;
    }
  }

  const { data: updatedRows, error } = await supabase.rpc("edit_order", {
    p_order_id:      id,
    p_name:          patch.name          ?? null,
    p_mobile:        patch.mobile        ?? null,
    p_in_date:       patch.inDate        ?? null,
    p_delivery_date: patch.deliveryDate  ?? null,
    p_in_time:       patch.inTime        ?? null,
    p_delivery_time: patch.deliveryTime  ?? null,
    p_garments:      patch.garments      ?? null,
    p_total:         patch.total         ?? null,
    p_advance:       patch.advance       ?? null,
    p_tailor:        patch.tailor        ?? null,
    p_special:       patch.special       ?? null,
    p_measurements:  patch.measurements  ?? null,
    p_images:        patch.images        ?? null,
    p_audios:        patch.audios        ?? null,
    p_videos:        patch.videos        ?? null,
    p_order_type:    patch.orderType     ?? null,
    p_booking_source: patch.bookingSource ?? null,
    p_fabric_cost:   patch.fabricCost    ?? null,
    p_other_cost:    patch.otherCost     ?? null,
    p_history_line:  historyLine,
    p_expected_advance: patch.advance !== undefined ? (patch.expectedAdvance ?? null) : null,
  });
  const updatedRow = updatedRows?.[0];
  if (error || !updatedRow) {
    // A payment landed while the edit form was open — refuse rather than overwrite it.
    if (error?.message?.includes("STALE_ADVANCE")) {
      return NextResponse.json(
        { error: "A payment was recorded while you were editing this order. Reload the page and try again." },
        { status: 409 }
      );
    }
    if (error?.message?.includes("cannot exceed") || error?.message?.includes("Invalid") || error?.message?.includes("negative")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
  }

  await logAction(supabase, user.email, `✏️ Order edited: ${updatedRow.name}`, id);

  // Sync measurements back to the customer's CRM profile, mirroring the create-order sync
  // below (and the legacy app's _handleSave, which ran this same upsert for both new AND
  // edited orders — line ~17070). Without this, editing an order's measurements silently
  // never reaches the customer record, and CRM measurements go stale after the first order.
  if (patch.measurements !== undefined) {
    const { data: existingCustomer, error: lookupError } = await supabase
      .from("customers")
      .select("id")
      .eq("mobile", updatedRow.mobile)
      .maybeSingle();
    if (!lookupError) {
      if (existingCustomer) {
        const { error } = await supabase.from("customers").update({ measurements: patch.measurements as Json }).eq("id", existingCustomer.id);
        if (error) await logAction(supabase, user.email, `⚠️ Customer measurements not synced for order ${id}`, id, error.message);
      } else {
        const { error } = await supabase.from("customers").insert({
          id: customerIdFromMobile(updatedRow.mobile),
          name: updatedRow.name,
          mobile: updatedRow.mobile,
          measurements: patch.measurements as Json,
          loyalty_points: 0,
          total_points_earned: 0,
          loyalty_history: [],
        });
        if (error) await logAction(supabase, user.email, `⚠️ Customer record not synced for order ${id}`, id, error.message);
      }
    }
  }

  return NextResponse.json({ order: mapOrderRow(updatedRow) });
}

/**
 * DELETE — guarded by server-side permission and order-status checks.
 * Also refunds any loyalty points that were redeemed at order creation (L3).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.deleteOrder) return NextResponse.json({ error: "No permission to delete orders" }, { status: 403 });

  // Fetch enough columns for guards + loyalty refund; avoid mapOrderRow on a partial row (M2).
  const { data: row, error: fetchError } = await supabase
    .from("orders")
    .select("id, name, status, mobile, history, advance")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Refuse to delete financially closed or delivered orders — they are accounting records.
  if (row.status === "payment" || row.status === "delivered") {
    return NextResponse.json(
      { error: `Cannot delete a ${row.status === "payment" ? "paid" : "delivered"} order. Archive it instead.` },
      { status: 409 }
    );
  }

  // Refuse to delete an order that already has money collected against it — there is no
  // separate order-payments ledger table, so the only record of that cash is this row's
  // advance/history. Deleting it destroys the only evidence the shop was ever paid.
  if ((row.advance || 0) > 0) {
    return NextResponse.json(
      { error: `This order has ₹${row.advance} collected against it and cannot be deleted. Refund the payment first, or move the order to a closed stage instead.` },
      { status: 409 }
    );
  }

  const { error: deleteError } = await supabase.from("orders").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await logAction(supabase, user.email, `🗑️ Order deleted: ${row.name}`, id);

  // L3: refund any loyalty points the customer spent as a redemption discount on this order.
  try {
    const ptDiscount = loyaltyDiscountOf({ history: Array.isArray(row.history) ? (row.history as string[]) : [] });
    if (ptDiscount > 0) {
      const loyaltyCfg = await getLoyaltyConfig(supabase);
      if (loyaltyCfg.enabled) {
        // Read the exact points spent from the customer's own ledger rather than
        // recomputing from ptDiscount via the *current* redeemPer100pts config — if that
        // rate changed since the order was placed, recomputing would over- or under-refund.
        const { data: custRow } = await supabase
          .from("customers")
          .select("loyalty_history")
          .eq("id", customerIdFromMobile(row.mobile))
          .maybeSingle();
        const history = (custRow?.loyalty_history as Array<{ type?: string; orderId?: string | null; pts?: number }> | null) || [];
        const redeemEntry = history.find((e) => e?.type === "redeem" && e?.orderId === id);
        const ptsToRefund = redeemEntry ? Math.abs(redeemEntry.pts || 0) : Math.round((ptDiscount / (loyaltyCfg.redeemPer100pts || 10)) * 100);
        if (ptsToRefund > 0) {
          await awardLoyaltyPoints(supabase, row.mobile, row.name, ptsToRefund, "manual", id, `Refund — order ${id} deleted`);
        }
      }
    }
  } catch {
    // Loyalty refund failure must not block the delete confirmation — log separately.
    await logAction(supabase, user.email, `⚠️ Loyalty refund failed after deleting ${id} — manual correction may be needed`, id);
  }

  // Release any referral coupon redeemed on this order — otherwise deleting the order that
  // used it permanently burns the coupon even though it was never actually fulfilled, and
  // reverse the referral bonus points already credited to the referrer for it.
  try {
    const couponAmount = couponDiscountOf({ history: Array.isArray(row.history) ? (row.history as string[]) : [] });
    if (couponAmount > 0) {
      const { data: couponRow } = await supabase.from("referral_coupons").select("code, referrer_mobile, referrer_name").eq("redeemed_order_id", id).maybeSingle();
      if (couponRow) {
        await supabase.rpc("release_referral_coupon", { p_code: couponRow.code });
        await awardLoyaltyPoints(supabase, couponRow.referrer_mobile, couponRow.referrer_name, -REFERRAL_BONUS_POINTS, "manual", id, `Referral bonus reversed — order ${id} deleted`);
      }
    }
  } catch {
    await logAction(supabase, user.email, `⚠️ Referral coupon release failed after deleting ${id} — manual correction may be needed`, id);
  }

  return NextResponse.json({ ok: true });
}
