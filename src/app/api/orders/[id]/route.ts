import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
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
  /** Whole-array replace, same convention as garments — omit the field to leave expenses
   *  untouched, send an array (possibly empty) to replace them entirely. */
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
    .optional(),
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

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const patch = parsed.data;

  // Cost/profitability data is internal-only, gated to the same viewReports permission as the
  // order form's Costs section — a caller without it can't smuggle cost changes through editOrder.
  if (!user.perms.viewReports) {
    patch.fabricCost = undefined;
    patch.otherCost = undefined;
    patch.expenses = undefined;
  }

  const financialSubmitted = patch.total !== undefined || patch.advance !== undefined;
  let historyLine: string | null = null;

  if (financialSubmitted) {
    const { data: cur } = await db.from("orders").select("total,advance").eq("id", id).maybeSingle();
    const curTotal   = cur?.total   ?? 0;
    const curAdvance = cur?.advance ?? 0;
    const newTotal   = patch.total   ?? curTotal;
    const newAdvance = patch.advance ?? curAdvance;
    // Block only when this edit actually CREATES or WORSENS an overpayment. An order that
    // already had advance > total (legacy/overpaid data — PRE_LIVE_VERIFY.sql has a query for
    // exactly these) must stay editable: rejecting it outright made such orders permanently
    // uneditable, since every save resubmits the same pre-existing numbers untouched.
    const alreadyOverpaid = curAdvance > curTotal;
    const worsening = newAdvance > curAdvance || newTotal < curTotal;
    if (newAdvance > newTotal && (!alreadyOverpaid || worsening)) {
      return NextResponse.json(
        {
          error: alreadyOverpaid
            ? `This order is already overpaid (₹${curAdvance} collected against a ₹${curTotal} total). You can edit it, but not increase the advance or reduce the total further.`
            : `Advance (₹${newAdvance}) cannot exceed total (₹${newTotal})`,
        },
        { status: 400 }
      );
    }
    // Only append a history line when the numbers actually moved. The edit form submits
    // total/advance on every save, so writing unconditionally would spam the audit trail
    // with "Total ₹2000→₹2000" entries on unrelated edits (e.g. fixing a name typo).
    if (newTotal !== curTotal || newAdvance !== curAdvance) {
      const userName = user.email.split("@")[0] || "user";
      historyLine = `✏️ Edited — Total ₹${curTotal}→₹${newTotal}, Advance ₹${curAdvance}→₹${newAdvance} by ${userName} — ${fmtNow()}`;
    }
  }

  const { data: updatedRows, error } = await db.rpc("edit_order", {
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

  // Whole-array replace: delete then re-insert, mirroring how garments themselves are already
  // fully replaced on edit (COALESCE(p_garments, garments) inside edit_order). Skipped entirely
  // when the field wasn't sent, so an edit that doesn't touch the Costs section never touches
  // existing expense rows.
  if (patch.expenses !== undefined) {
    const { error: deleteExpensesError } = await db.from("order_expenses").delete().eq("order_id", id);
    if (deleteExpensesError) {
      await logAction(supabase, user.email, `⚠️ Stitching expenses not updated for order ${id}`, id, deleteExpensesError.message);
    } else if (patch.expenses.length > 0) {
      const { error: insertExpensesError } = await db.from("order_expenses").insert(
        patch.expenses.map((e) => ({
          order_id: id,
          category: e.category,
          qty: e.qty ?? null,
          unit: e.unit ?? null,
          rate: e.rate ?? null,
          amount: e.amount,
          created_by: user.email,
        }))
      );
      if (insertExpensesError) {
        await logAction(supabase, user.email, `⚠️ Stitching expenses not updated for order ${id}`, id, insertExpensesError.message);
      }
    }
  }

  // Sync measurements back to the customer's CRM profile, mirroring the create-order sync
  // below (and the legacy app's _handleSave, which ran this same upsert for both new AND
  // edited orders — line ~17070). Without this, editing an order's measurements silently
  // never reaches the customer record, and CRM measurements go stale after the first order.
  if (patch.measurements !== undefined) {
    const { data: existingCustomer, error: lookupError } = await db
      .from("customers")
      .select("id")
      .eq("mobile", updatedRow.mobile)
      .maybeSingle();
    if (!lookupError) {
      if (existingCustomer) {
        const { error } = await db.from("customers").update({ measurements: patch.measurements as Json }).eq("id", existingCustomer.id);
        if (error) await logAction(supabase, user.email, `⚠️ Customer measurements not synced for order ${id}`, id, error.message);
      } else {
        const { error } = await db.from("customers").insert({
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

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  // Fetch enough columns for guards + loyalty refund; avoid mapOrderRow on a partial row (M2).
  const { data: row, error: fetchError } = await db
    .from("orders")
    .select("id, name, status, mobile, history, advance, garments, payables_confirmed_at, piece_rate_paid_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Admin override: an admin can always delete an order, bypassing every guard below. Every
  // other role still goes through them. Since order_payments.order_id has no ON DELETE CASCADE
  // (unlike order_expenses), an admin deleting an order with payment rows still needs those
  // rows removed first below, or the delete would fail on the foreign key instead of the guard.
  const isAdmin = user.role === "admin";
  const guardWouldHaveBlocked = !!row.piece_rate_paid_at || !!row.payables_confirmed_at || (row.advance || 0) > 0;
  const isAdminOverride = isAdmin && guardWouldHaveBlocked;

  if (!isAdmin) {
    // Confirming payables freezes them for payroll to pick up; deleting the order after that
    // (with no equivalent guard to the advance>0 check below) would silently destroy the only
    // record that the payable was confirmed/paid — a real gap once a payroll run has already
    // paid the tailor for it. Mirrors the identical guard added to work-orders/[id]/route.ts.
    if (row.piece_rate_paid_at) {
      return NextResponse.json(
        { error: "This order's tailor payable has already been paid out in a payroll run and cannot be deleted." },
        { status: 409 }
      );
    }
    if (row.payables_confirmed_at) {
      return NextResponse.json(
        { error: "This order's tailor payable has been confirmed for payroll and cannot be deleted." },
        { status: 409 }
      );
    }

    // A blanket "delivered"/"payment" stage block used to sit here, pointing at an "Archive"
    // feature that was never actually built — a genuine dead end, since deleting the order's
    // payment(s) below (which the message DID offer as an option) still leaves the order at
    // "delivered" stage (delete_order_payment only reverts payment -> delivered, not further),
    // meaning a fully-paid-then-refunded order could never actually be deleted at all. The real
    // safeguard for "this is an accounting record" is the money check right below — a delivered/
    // paid order becomes deletable once its payment rows are gone (order detail page ->
    // Payments), same as any other order; stage alone no longer blocks it.

    // Refuse to delete an order that already has money collected against it. Each payment is a
    // real row in order_payments now — deleting them there (order detail page → Payments) reverses
    // this same advance figure, at which point the order becomes deletable normally.
    if ((row.advance || 0) > 0) {
      return NextResponse.json(
        {
          error: `This order has ₹${row.advance} collected against it and cannot be deleted. Delete the recorded payment(s) first from the order's Payments section, or move the order to a closed stage instead.`,
        },
        { status: 409 }
      );
    }
  } else if ((row.advance || 0) > 0) {
    // Bypassing the money guard above still requires clearing order_payments rows first —
    // the table has no ON DELETE CASCADE, so leaving them would fail the delete below with a
    // foreign key error instead of a guard message.
    const { error: deletePaymentsError } = await db.from("order_payments").delete().eq("order_id", id);
    if (deletePaymentsError) return NextResponse.json({ error: deletePaymentsError.message }, { status: 500 });
  }

  // The order is the only place a garment's frozen payableAmount lives — deleting it destroys
  // that number outright. If it was already paid out (piece_rate_paid_at set), that's harmless:
  // the payslip snapshot the run created holds the tailor's total independently. But a payable
  // that's confirmed and NOT yet paid is still counted live off this exact row by every future
  // payroll run (see /api/payroll/run's confirmedOrders query) — deleting it here with no trace
  // would silently write off money genuinely owed to the tailor, with no payslip ever created
  // for it. Surface exactly what's being lost, per tailor, so accounting can settle it by hand.
  let lostPayableNote: string | null = null;
  if (isAdmin && row.payables_confirmed_at && !row.piece_rate_paid_at) {
    const garments = (Array.isArray(row.garments) ? row.garments : []) as { tailor?: string; payableAmount?: number }[];
    const byTailor = new Map<string, number>();
    for (const g of garments) {
      if (g.tailor && (g.payableAmount || 0) > 0) byTailor.set(g.tailor, (byTailor.get(g.tailor) || 0) + (g.payableAmount || 0));
    }
    if (byTailor.size > 0) {
      const { data: tailorRows } = await db.from("employees").select("id, name").in("id", Array.from(byTailor.keys()));
      const nameById = new Map((tailorRows || []).map((t) => [t.id, t.name]));
      const parts = Array.from(byTailor.entries()).map(([tailorId, amount]) => `${nameById.get(tailorId) || tailorId}: ₹${amount}`);
      lostPayableNote = `⚠️ Confirmed-but-unpaid tailor payable(s) lost on delete — ${parts.join(", ")}. Settle manually if owed.`;
    }
  }

  const { error: deleteError } = await db.from("orders").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await logAction(
    supabase,
    user.email,
    isAdminOverride
      ? `🗑️ Order deleted (admin override — bypassed payable/payment guards): ${row.name}`
      : `🗑️ Order deleted: ${row.name}`,
    id,
    lostPayableNote
  );

  // L3: refund any loyalty points the customer spent as a redemption discount on this order.
  try {
    const ptDiscount = loyaltyDiscountOf({ history: Array.isArray(row.history) ? (row.history as string[]) : [] });
    if (ptDiscount > 0) {
      const loyaltyCfg = await getLoyaltyConfig(supabase);
      if (loyaltyCfg.enabled) {
        // Read the exact points spent from the customer's own ledger rather than
        // recomputing from ptDiscount via the *current* redeemPer100pts config — if that
        // rate changed since the order was placed, recomputing would over- or under-refund.
        const { data: custRow } = await db
          .from("customers")
          .select("loyalty_history")
          .eq("id", customerIdFromMobile(row.mobile))
          .maybeSingle();
        const history = (custRow?.loyalty_history as Array<{ type?: string; orderId?: string | null; pts?: number }> | null) || [];
        const redeemEntry = history.find((e) => e?.type === "redeem" && e?.orderId === id);
        const ptsToRefund = redeemEntry ? Math.abs(redeemEntry.pts || 0) : Math.round((ptDiscount / (loyaltyCfg.redeemPer100pts || 10)) * 100);
        if (ptsToRefund > 0) {
          await awardLoyaltyPoints(db, row.mobile, row.name, ptsToRefund, "manual", id, `Refund — order ${id} deleted`);
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
      const { data: couponRow } = await db.from("referral_coupons").select("code, referrer_mobile, referrer_name").eq("redeemed_order_id", id).maybeSingle();
      if (couponRow) {
        await db.rpc("release_referral_coupon", { p_code: couponRow.code });
        await awardLoyaltyPoints(db, couponRow.referrer_mobile, couponRow.referrer_name, -REFERRAL_BONUS_POINTS, "manual", id, `Referral bonus reversed — order ${id} deleted`);
      }
    }
  } catch {
    await logAction(supabase, user.email, `⚠️ Referral coupon release failed after deleting ${id} — manual correction may be needed`, id);
  }

  return NextResponse.json({ ok: true });
}
