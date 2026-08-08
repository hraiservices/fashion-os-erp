import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { STAGE_META, getNextStage, fmtNow, deliveryBonusPoints } from "@/lib/business-rules";
import { logAction, sendAdminNotification } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";

/**
 * Stage-advance, ported from `_advance()`, Stitching_Manager_Pro_v16.html ~line 16900.
 * Runs server-side so the permission check (changeStage) can't be bypassed client-side,
 * and so the delivery-bonus loyalty award happens in the same request as the stage write.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.changeStage) return NextResponse.json({ error: "No permission to change order stage" }, { status: 403 });

  const { data: row, error: fetchError } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const order = mapOrderRow(row);
  const next = getNextStage(order.status);
  if (!next) return NextResponse.json({ error: "Order is already at the final stage" }, { status: 400 });
  // Cannot mark as paid while balance is outstanding — receivable would become invisible
  if (next === "payment" && order.balance > 0) {
    return NextResponse.json({ error: `Cannot close order — ₹${order.balance} balance still due. Record full payment first.` }, { status: 400 });
  }

  const curMeta = STAGE_META[order.status];
  const nextMeta = STAGE_META[next];
  const userName = user.email.split("@")[0] || "user";
  const historyLine = `${nextMeta.emoji} ${nextMeta.label} — ${fmtNow()} by ${userName}`;

  const { data: updatedRow, error: updateError } = await supabase
    .from("orders")
    .update({ status: next, history: [...order.history, historyLine] })
    .eq("id", id)
    .select("*")
    .single();
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

  // Delivery bonus — the (type, orderId) idempotency guard inside award_loyalty_points
  // ensures it is granted only once even if the order is re-delivered.
  if (next === "delivered") {
    const loyaltyCfg = await getLoyaltyConfig(supabase);
    if (loyaltyCfg.enabled) {
      await awardLoyaltyPoints(supabase, order.mobile, order.name, deliveryBonusPoints(loyaltyCfg), "delivery", id, "Order delivered");
    }
  }

  return NextResponse.json({ order: mapOrderRow(updatedRow) });
}
