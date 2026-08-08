import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildBriefingSummary } from "@/lib/ai-briefing";
import { generateBriefing } from "@/lib/chatbot/gemini";

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

  const today = new Date().toISOString().slice(0, 10);
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

  return NextResponse.json({ generated: true, summary, message });
}
