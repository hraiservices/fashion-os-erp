import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aiText, loadAiConfig, SHOP_VOICE } from "@/lib/ai-assist";
import { aiFeatureOn } from "@/lib/ai-config";
import { fallbackNudge, upcomingFestival } from "@/lib/festivals";
import { istDateString } from "@/lib/ist-date";
import { isOpenStage } from "@/lib/lead-stages";
import { fetchAll, targetsContext } from "@/lib/targets-server";
import { addDaysIso } from "@/lib/work-tasks";

const CACHE_KEY = "aiNudgeDraft";

/** GET — before a festival, the past customers worth a message, with a ready-to-send message (AI-written when AI is on, a plain one otherwise). */
export async function GET() {
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const db: SupabaseClient<Database> = gate.ctx.db;
  const today = istDateString();
  const festival = upcomingFestival(today);
  if (!festival) return NextResponse.json({ festival: null, message: "", aiDrafted: false, customers: [] });

  const since = addDaysIso(today, -730);
  const recentCut = addDaysIso(today, -90);
  const orders = await fetchAll((a, b) => db.from("orders").select("name, mobile, total, in_date").gte("in_date", since).order("id").range(a, b));
  const { data: leadRows } = await db.from("leads").select("mobile, stage");
  const openLeadMobiles = new Set((leadRows || []).filter((l) => isOpenStage(l.stage)).map((l) => l.mobile));

  const by = new Map<string, { name: string; mobile: string; lastOrder: string; spent: number }>();
  for (const o of orders) {
    const mobile = (o.mobile || "").replace(/\D/g, "").slice(-10);
    if (mobile.length < 10) continue;
    const cur = by.get(mobile) ?? { name: o.name, mobile, lastOrder: o.in_date, spent: 0 };
    cur.spent += Number(o.total) || 0;
    if (o.in_date > cur.lastOrder) {
      cur.lastOrder = o.in_date;
      cur.name = o.name;
    }
    by.set(mobile, cur);
  }
  const customers = [...by.values()].filter((c) => c.lastOrder < recentCut && !openLeadMobiles.has(c.mobile)).sort((a, b) => b.spent - a.spent).slice(0, 15);

  let message = fallbackNudge(festival.name);
  let aiDrafted = false;
  if (customers.length) {
    const config = await loadAiConfig(db);
    if (aiFeatureOn(config, "nudge")) {
      const { data: cached } = await db.from("app_settings").select("value").eq("key", CACHE_KEY).maybeSingle();
      const c = cached?.value as { festival?: string; message?: string; date?: string } | null;
      if (c?.festival === festival.name && c.message && c.date && c.date >= addDaysIso(today, -14)) {
        message = c.message;
        aiDrafted = true;
      } else {
        try {
          const drafted = await aiText(
            db,
            "nudge",
            `${SHOP_VOICE}\nWrite one WhatsApp message a boutique sends to past customers before ${festival.name} (${festival.daysAway} days away), inviting them to get a new outfit stitched in time. Under 45 words, warm, one clear invitation, mention that early booking helps delivery on time. Start with "Hi {name}!" — keep {name} literally, it is filled in per customer. Output only the message.`,
            [{ text: "Write the message." }]
          );
          if (drafted.includes("{name}")) {
            message = drafted;
            aiDrafted = true;
            await db.from("app_settings").upsert({ key: CACHE_KEY, value: { festival: festival.name, message, date: today } });
          }
        } catch {
          /* the plain message above still works */
        }
      }
    }
  }
  return NextResponse.json({ festival, message, aiDrafted, customers });
}
