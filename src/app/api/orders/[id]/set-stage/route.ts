import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { STAGES, STAGE_META, fmtNow, deliveryBonusPoints, computeEarnPoints, type Stage } from "@/lib/business-rules";
import { logAction, sendAdminNotification } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";

const bodySchema = z.object({ stage: z.enum(STAGES as unknown as [Stage, ...Stage[]]) });

/**
 * Move an order to an arbitrary stage — what the Kanban board's drag-and-drop needs,
 * since a card can be dropped into any column (including an earlier one) rather than
 * only stepping forward like /advance-stage.
 *
 * Everything the advance path does is preserved here: the changeStage permission gate,
 * the history line, the activity-log entry, the admin notification, and the delivery
 * bonus. The bonus stays idempotent via the (type, orderId) guard inside
 * award_loyalty_points, so dragging out of and back into "Delivered" cannot double-award.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.changeStage) return NextResponse.json({ error: "No permission to change order stage" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  const target = parsed.data.stage;

  const { data: row, error: fetchError } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const order = mapOrderRow(row);
  if (order.status === target) return NextResponse.json({ order });
  // Cannot drag to "payment" while balance is outstanding
  if (target === "payment" && order.balance > 0) {
    return NextResponse.json({ error: `Cannot close order — ₹${order.balance} balance still due. Record full payment first.` }, { status: 400 });
  }

  const curMeta = STAGE_META[order.status];
  const nextMeta = STAGE_META[target];
  const userName = user.email.split("@")[0] || "user";
  const historyLine = `${nextMeta.emoji} ${nextMeta.label} — ${fmtNow()} by ${userName}`;

  const { data: updatedRows, error: updateError } = await supabase.rpc("set_order_stage", {
    p_order_id: id,
    p_new_status: target,
    p_history_line: historyLine,
  });
  const updatedRow = updatedRows?.[0];
  if (updateError || !updatedRow) return NextResponse.json({ error: updateError?.message || "Update failed" }, { status: 500 });

  await logAction(
    supabase,
    user.email,
    `${curMeta.emoji} → ${nextMeta.emoji} Stage changed: ${curMeta.label} → ${nextMeta.label} for ${order.name}`,
    id,
    `Tailor: ${order.tailor}`
  );
  await sendAdminNotification(supabase, user.email, {
    orderId: id,
    customerName: order.name,
    fromStage: curMeta.label,
    toStage: nextMeta.label,
  });

  const loyaltyCfg = await getLoyaltyConfig(supabase);
  if (loyaltyCfg.enabled) {
    if (target === "delivered") {
      await awardLoyaltyPoints(supabase, order.mobile, order.name, deliveryBonusPoints(loyaltyCfg), "delivery", id, "Order delivered");
    }
    // Earn points when dragging a fully-prepaid order to "payment"
    // (idempotency guard inside award_loyalty_points prevents double-award)
    if (target === "payment" && order.balance === 0) {
      const earnPts = computeEarnPoints(order.total, loyaltyCfg);
      if (earnPts > 0) {
        await awardLoyaltyPoints(supabase, order.mobile, order.name, earnPts, "earn", id, `Full payment received ₹${order.total}`);
      }
    }
  }

  return NextResponse.json({ order: mapOrderRow(updatedRow) });
}
