import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { buildSummaryInput } from "@/lib/day-book-server";
import { buildEndOfDaySummary } from "@/lib/day-book-extras";
import { compactSummary } from "@/lib/day-book-insights";
import { sendPushToAll } from "@/lib/push";
import { sendWhatsAppTemplateText, type WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { logWhatsAppSend } from "@/lib/whatsapp-log";
import { istDateString } from "@/lib/ist-date";
import { aiText, loadAiConfig, SHOP_VOICE } from "@/lib/ai-assist";
import { aiFeatureOn } from "@/lib/ai-config";
import { addDaysIso } from "@/lib/work-tasks";

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
  const tomorrowLines = await tomorrowSection(supabase, today);
  let message = compactSummary(`${input.closing ? "" : "⚠️ Day not closed yet — count the drawer and close it in the Day Book.\n"}${buildEndOfDaySummary(input)}${tomorrowLines}`);
  message = await withAiNote(supabase, message);

  const { error } = await supabase.from("admin_notifications").insert({ type: "day_book_summary", message, read: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sendPushToAll({ title: input.closing ? "Day Book summary" : "Day not closed yet", body: message, url: "/reports/day-book", critical: !input.closing }).catch(() => {});

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

/** "Tomorrow" lines for the summary: orders due and lead follow-ups due. Best effort — never blocks the summary. */
async function tomorrowSection(db: SupabaseClient<Database>, today: string): Promise<string> {
  try {
    const tomorrow = addDaysIso(today, 1);
    const [orders, followUps] = await Promise.all([
      db.from("orders").select("id", { count: "exact", head: true }).eq("delivery_date", tomorrow).not("status", "in", "(delivered,payment,cancelled)"),
      db.from("work_tasks").select("id", { count: "exact", head: true }).eq("link_type", "lead").not("status", "in", "(done,cancelled)").eq("due_date", tomorrow),
    ]);
    const o = orders.count ?? 0;
    const f = followUps.count ?? 0;
    if (o === 0 && f === 0) return "";
    return `\n\nTomorrow: ${[o ? `${o} ${o === 1 ? "order" : "orders"} due` : "", f ? `${f} lead ${f === 1 ? "follow-up" : "follow-ups"}` : ""].filter(Boolean).join(" · ")}`;
  } catch {
    return "";
  }
}

/** When the admin has switched "End-of-day note" on, adds one short plain-English observation. A failure leaves the summary as is. */
async function withAiNote(db: SupabaseClient<Database>, message: string): Promise<string> {
  try {
    const config = await loadAiConfig(db);
    if (!aiFeatureOn(config, "eod")) return message;
    const note = await aiText(db, "eod", `${SHOP_VOICE}\nYou read a boutique owner's end-of-day numbers. Write ONE short sentence (under 25 words) pointing out the single most useful thing to notice or do tomorrow. Use only the numbers given. No greeting, no markdown. Output only the sentence.`, [{ text: message }]);
    return `${message}\n\n💡 ${note.replace(/\s+/g, " ").slice(0, 200)}`;
  } catch {
    return message;
  }
}
