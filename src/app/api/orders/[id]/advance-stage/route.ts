import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { STAGE_META, getNextStage, fmtNow, deliveryBonusPoints } from "@/lib/business-rules";
import { logAction, sendAdminNotification } from "@/lib/logging";
import { awardLoyaltyPoints } from "@/lib/loyalty";
import { getLoyaltyConfig } from "@/lib/settings";
import { sendWhatsAppTemplateText, type WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { inr } from "@/lib/format";

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
    // rawStatus, not status: mapOrderRow folds legacy 'trial' into 'ready', but the DB row still
    // holds 'trial' — sending the folded value made the lock never match, so those orders
    // could never change stage again (409 "already changed", forever).
    p_expected_status: order.rawStatus,
  });
  const updatedRow = updatedRows?.[0];
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  // 0 rows = another concurrent request already advanced the stage — treat as conflict.
  if (!updatedRow) return NextResponse.json({ error: "Stage was already changed by another request. Please refresh." }, { status: 409 });

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

  // Best-effort, same reasoning as the loyalty side-effect above — a send failure (or the
  // feature simply not being configured) must never fail a stage change that already
  // succeeded. A proactive, shop-initiated message needs its own approved Meta template
  // (readyTemplateName), same restriction as the daily-briefing push.
  if (next === "ready") {
    try {
      const { data: cloudApiSetting } = await supabase.from("app_settings").select("value").eq("key", "whatsappCloudApiConfig").maybeSingle();
      const cloudApi = cloudApiSetting?.value as WhatsAppCloudApiConfig | null;
      const updated = mapOrderRow(updatedRow);
      if (cloudApi?.phoneNumberId && cloudApi?.accessToken && cloudApi?.readyTemplateName) {
        await sendWhatsAppTemplateText(cloudApi, updated.mobile, cloudApi.readyTemplateName, cloudApi.languageCode || "en_US", [
          updated.name,
          updated.id,
          inr(updated.balance),
        ]);
      }
    } catch (e) {
      await logAction(supabase, user.email, `⚠️ "Ready for pickup" WhatsApp nudge failed for ${id} — order still advanced fine`, id, String(e));
    }
  }

  return NextResponse.json({ order: mapOrderRow(updatedRow) });
}
