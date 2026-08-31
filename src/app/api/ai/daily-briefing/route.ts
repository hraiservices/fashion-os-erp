import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildBriefingSummary } from "@/lib/ai-briefing";
import { generateBriefing } from "@/lib/chatbot/gemini";
import { sendPushToAll } from "@/lib/push";
import { sendWhatsAppTemplateText, type WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { logWhatsAppSend } from "@/lib/whatsapp-log";
import { istDateString } from "@/lib/ist-date";

/**
 * Cron entry point — hit daily by vercel.json's schedule, mirroring the recurring-invoices
 * cron route's auth pattern (CRON_SECRET bearer token, service-role client since there's
 * no logged-in session). Idempotent per calendar day: if today's briefing already exists,
 * this is a no-op rather than a duplicate notification (and a wasted Gemini call).
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 501 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 501 });
  }

  const today = istDateString();
  const { data: existing } = await supabase
    .from("admin_notifications")
    .select("id")
    .eq("type", "ai_briefing")
    .gte("created_at", `${today}T00:00:00Z`)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ skipped: true, reason: "Already generated today" });
  }

  const summary = await buildBriefingSummary(supabase);
  const message = await generateBriefing(summary);

  const { error } = await supabase.from("admin_notifications").insert({
    type: "ai_briefing",
    message,
    read: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort — a push failure (or push not configured at all) shouldn't fail the briefing
  // itself, which already succeeded and is visible via the in-app notification bell regardless.
  await sendPushToAll({ title: "Daily Briefing", body: message, url: "/dashboard" }).catch(() => {});

  // Also best-effort, and independently so one bad recipient number doesn't block the rest —
  // this is a proactive, shop-initiated message, so it goes through an approved template
  // rather than sendWhatsAppTextMessage (that one's only for replying to an inbound message
  // within Meta's 24-hour customer-service window, which doesn't apply here).
  const [{ data: cloudApiSetting }, { data: recipientsSetting }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "whatsappCloudApiConfig").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "dailyBriefingRecipients").maybeSingle(),
  ]);
  const cloudApi = cloudApiSetting?.value as WhatsAppCloudApiConfig | null;
  const recipients = (recipientsSetting?.value as string[] | null) || [];
  if (cloudApi?.phoneNumberId && cloudApi?.accessToken && cloudApi?.briefingTemplateName && recipients.length > 0) {
    await Promise.all(
      recipients.map((mobile) =>
        sendWhatsAppTemplateText(cloudApi, mobile, cloudApi.briefingTemplateName!, cloudApi.languageCode || "en_US", [message])
          .then((waMessageId) => logWhatsAppSend(supabase, { messageType: "daily_briefing", toMobile: mobile, waMessageId, status: "sent" }))
          .catch((e) => {
            console.error(`Daily briefing WhatsApp send failed for ${mobile}:`, e);
            return logWhatsAppSend(supabase, { messageType: "daily_briefing", toMobile: mobile, status: "failed", error: e instanceof Error ? e.message : String(e) });
          })
      )
    );
  }

  return NextResponse.json({ generated: true, summary, message });
}
