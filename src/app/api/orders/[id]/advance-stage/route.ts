import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { STAGE_META, getNextStage, fmtNow, deliveryBonusPoints } from "@/lib/business-rules";
import { logAction, sendAdminNotification } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";

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
  if (next === "payment" && order.balance > 0) {
    return NextResponse.json({ error: `Cannot close order — ₹${order.balance} balance still due. Record full payment first.` }, { status: 400 });
  }

  const curMeta  = STAGE_META[order.status];
  const nextMeta = STAGE_META[next];
  const userName = user.email.split("@")[0] || "user";
  const historyLine = `${nextMeta.emoji} ${nextMeta.label} — ${fmtNow()} by ${userName}`;

  // C2: pass p_expected_status so a concurrent advance on the same order returns 0 rows
  // (both read "cutting", both try to advance to "stitching"; second one is a no-op).
  const { data: updatedRows, error: updateError } = await supabase.rpc("set_order_stage", {
    p_order_id:        id,
    p_new_status:      next,
    p_history_line:    historyLine,
    p_expected_status: order.status,
  });
  const updatedRow = updatedRows?.[0];
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  // 0 rows = another concurrent request already advanced the stage — treat as conflict.
  if (!updatedRow) return NextResponse.json({ error: "Stage was already changed by another request. Please refresh." }, { status: 409 });

  await logAction(
    supabase, user.email,
    `${curMeta.emoji} → ${nextMeta.emoji} Stage changed: ${curMeta.label} → ${nextMeta.label} for ${order.name}`,
    id, `Tailor: ${order.tailor}`
  );
  await sendAdminNotification(supabase, user.email, {
    orderId: id, customerName: order.name, fromStage: curMeta.label, toStage: nextMeta.label,
  });

  // H7: loyalty side-effects run after the stage is committed. Any failure returns a warning
  // but must not cause HTTP 500 — the stage change already happened in the DB.
  if (next === "delivered") {
    try {
      const loyaltyCfg = await getLoyaltyConfig(supabase);
      if (loyaltyCfg.enabled) {
        await awardLoyaltyPoints(supabase, order.mobile, order.name, deliveryBonusPoints(loyaltyCfg), "delivery", id, "Order delivered");
      }
    } catch (loyaltyErr) {
      await logAction(supabase, user.email, `⚠️ Delivery bonus failed for ${id} — manual correction needed`, id, String(loyaltyErr));
    }
  }

  return NextResponse.json({ order: mapOrderRow(updatedRow) });
}
