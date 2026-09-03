import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapOrderRow } from "@/lib/types";
import { STAGES, STAGE_META, fmtNow, deliveryBonusPoints, computeEarnPoints, loyaltyDiscountOf, couponDiscountOf, getNextStage, type Stage } from "@/lib/business-rules";
import { logAction, sendAdminNotification } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";

const bodySchema = z.object({ stage: z.enum(STAGES as unknown as [Stage, ...Stage[]]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.changeStage) return NextResponse.json({ error: "No permission to change order stage" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  const target = parsed.data.stage;

  const { data: row, error: fetchError } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const order = mapOrderRow(row);
  if (order.status === target) return NextResponse.json({ order });

  // M1: once an order is financially closed it cannot be re-opened via drag.
  if (order.status === "payment") {
    return NextResponse.json({ error: "Cannot reopen a closed financial record." }, { status: 409 });
  }

  // This mirrors a check that only ever existed client-side (handleSetStage in
  // orders/page.tsx) — a direct POST here with an arbitrary target skipped every
  // intermediate stage (and, since tailors hold changeStage, could be done by a tailor
  // account), including "ready", the exact transition snapshot_tailor_payables fires on —
  // skipping it silently voided piece-rate pay tracking for that order.
  if (getNextStage(order.status) !== target) {
    return NextResponse.json({ error: "Change stage step by step — you can only move to the next stage." }, { status: 400 });
  }

  // H8: moving to 'payment' is a financial close — requires managePayments, not just changeStage.
  // Tailors have changeStage but not managePayments and must not be able to close orders.
  if (target === "payment" && !user.perms.managePayments) {
    return NextResponse.json({ error: "No permission to close orders financially." }, { status: 403 });
  }

  if (target === "payment" && order.balance > 0) {
    return NextResponse.json({ error: `Cannot close order — ₹${order.balance} balance still due. Record full payment first.` }, { status: 400 });
  }

  const curMeta  = STAGE_META[order.status];
  const nextMeta = STAGE_META[target];
  const userName = user.email.split("@")[0] || "user";
  const historyLine = `${nextMeta.emoji} ${nextMeta.label} — ${fmtNow()} by ${userName}`;

  // C2: optimistic-lock on current status prevents skipping stages under concurrency.
  const { data: updatedRows, error: updateError } = await db.rpc("set_order_stage", {
    p_order_id:        id,
    p_new_status:      target,
    p_history_line:    historyLine,
    // rawStatus, not status: mapOrderRow folds legacy 'trial' into 'ready', but the DB row still
    // holds 'trial' — sending the folded value made the lock never match, so those orders
    // could never change stage again (409 "already changed", forever).
    p_expected_status: order.rawStatus,
  });
  const updatedRow = updatedRows?.[0];
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updatedRow) return NextResponse.json({ error: "Someone else already updated this order — its card has been refreshed." }, { status: 409 });

  // order.tailor is now an employee id, not a name — dropped from this detail string (was
  // showing a raw UUID); the order's own detail page already shows the tailor's name.
  await logAction(
    supabase, user.email,
    `${curMeta.emoji} → ${nextMeta.emoji} Stage changed: ${curMeta.label} → ${nextMeta.label} for ${order.name}`,
    id
  );
  await sendAdminNotification(supabase, user.email, {
    orderId: id, customerName: order.name, fromStage: curMeta.label, toStage: nextMeta.label,
  });

  // H7/M9: loyalty calls happen after stage is committed — wrap in try/catch so a loyalty
  // RPC failure doesn't return HTTP 500 with a stale Kanban cache (stage already changed in DB).
  try {
    const loyaltyCfg = await getLoyaltyConfig(supabase);
    if (loyaltyCfg.enabled) {
      if (target === "delivered") {
        await awardLoyaltyPoints(db, order.mobile, order.name, deliveryBonusPoints(loyaltyCfg), "delivery", id, "Order delivered");
      }
      if (target === "payment" && order.balance === 0) {
        // H5: earn on net total (total - any loyalty/coupon discount already applied to this order).
        const netTotal = Math.max(0, order.total - loyaltyDiscountOf(order) - couponDiscountOf(order));
        const earnPts = computeEarnPoints(netTotal, loyaltyCfg);
        if (earnPts > 0) {
          await awardLoyaltyPoints(db, order.mobile, order.name, earnPts, "earn", id, `Full payment received ₹${order.total}`);
        }
      }
    }
  } catch (loyaltyErr) {
    await logAction(supabase, user.email, `⚠️ Loyalty award failed for stage change on ${id} — manual correction needed`, id, String(loyaltyErr));
  }

  return NextResponse.json({ order: mapOrderRow(updatedRow) });
}
