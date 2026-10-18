import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aiText, loadAiConfig, SHOP_VOICE } from "@/lib/ai-assist";
import { aiFeatureOn } from "@/lib/ai-config";
import { istDateString } from "@/lib/ist-date";
import { isOpenStage } from "@/lib/lead-stages";
import { reorderCandidates, reorderMessage } from "@/lib/reorder";
import { fetchAll, targetsContext } from "@/lib/targets-server";
import { addDaysIso } from "@/lib/work-tasks";

const CACHE_KEY = "aiReorderDraft";

/** GET — regulars who are due another order (by their own rhythm), with a ready message (AI-written when switched on, a plain one otherwise). */
export async function GET() {
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const db: SupabaseClient<Database> = gate.ctx.db;
  const today = istDateString();

  const orders = await fetchAll((a, b) => db.from("orders").select("name, mobile, in_date, garments").gte("in_date", addDaysIso(today, -1100)).order("id").range(a, b));
  const { data: leadRows } = await db.from("leads").select("mobile, stage");
  const openLeadMobiles = new Set((leadRows || []).filter((l) => isOpenStage(l.stage)).map((l) => l.mobile));
  const customers = reorderCandidates(orders, today, openLeadMobiles);

  let message = reorderMessage();
  let aiDrafted = false;
  if (customers.length) {
    const config = await loadAiConfig(db);
    if (aiFeatureOn(config, "reorder")) {
      const { data: cached } = await db.from("app_settings").select("value").eq("key", CACHE_KEY).maybeSingle();
      const c = cached?.value as { message?: string; date?: string } | null;
      if (c?.message && c.date && c.date >= addDaysIso(today, -14)) {
        message = c.message;
        aiDrafted = true;
      } else {
        try {
          const drafted = await aiText(
            db,
            "reorder",
            `${SHOP_VOICE}\nWrite one WhatsApp message a boutique sends to a loyal regular customer who usually orders every couple of months and is due again. Under 40 words, warm and relaxed, no pressure, no discounts or offers. Start with "Hi {name}!" and mention their last outfit using {garment}. Keep {name} and {garment} literally — they are filled in per customer. Output only the message.`,
            [{ text: "Write the message." }],
            gate.ctx.email
          );
          if (drafted.includes("{name}") && drafted.includes("{garment}")) {
            message = drafted;
            aiDrafted = true;
            await db.from("app_settings").upsert({ key: CACHE_KEY, value: { message, date: today } });
          }
        } catch {
          /* the plain message above still works */
        }
      }
    }
  }
  return NextResponse.json({ message, aiDrafted, customers });
}
