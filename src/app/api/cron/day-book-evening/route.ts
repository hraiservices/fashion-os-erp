import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildSummaryInput } from "@/lib/day-book-server";
import { buildEndOfDaySummary } from "@/lib/day-book-extras";
import { compactSummary } from "@/lib/day-book-insights";
import { sendPushToAll } from "@/lib/push";
import { sendWhatsAppTemplateText, type WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { logWhatsAppSend } from "@/lib/whatsapp-log";
import { istDateString } from "@/lib/ist-date";

/**
 * Evening cron (vercel.json, ~9 pm IST): posts the day's Day Book summary as an in-app
 * notification + push, nudges if the cash drawer hasn't been closed, and sends the summary to the
 * same WhatsApp recipients as the morning briefing. Same CRON_SECRET auth and idempotency
 * pattern as the daily-briefing cron — a second call the same day is a no-op.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 501 });
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 501 });

  const today = istDateString();
  const { data: existing } = await supabase
    .from("admin_notifications")
    .select("id")
    .eq("type", "day_book_summary")
    .gte("created_at", `${today}T00:00:00Z`)
    .maybeSingle();
  if (existing) return NextResponse.json({ skipped: true, reason: "Already sent today" });

  const input = await buildSummaryInput(supabase, today);
  const message = compactSummary(`${input.closing ? "" : "⚠️ Day not closed yet — count the drawer and close it in the Day Book.\n"}${buildEndOfDaySummary(input)}`);

  const { error } = await supabase.from("admin_notifications").insert({ type: "day_book_summary", message, read: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sendPushToAll({ title: input.closing ? "Day Book summary" : "Day not closed yet", body: message, url: "/reports/day-book" }).catch(() => {});

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
          .catch((e) => logWhatsAppSend(supabase, { messageType: "daily_briefing", toMobile: mobile, status: "failed", error: e instanceof Error ? e.message : String(e) }))
      )
    );
  }

  return NextResponse.json({ sent: true, closed: !!input.closing, message });
}
