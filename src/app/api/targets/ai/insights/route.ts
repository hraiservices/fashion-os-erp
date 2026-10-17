import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aiErrorResponse, aiJson, SHOP_VOICE } from "@/lib/ai-assist";
import { istDateString } from "@/lib/ist-date";
import { isOpenStage } from "@/lib/lead-stages";
import { lostReasonStats, ownerStats, sourceStats, winRate } from "@/lib/targets";
import { dateStr, forbidden, parseBody } from "@/lib/targets-api";
import { fetchAll, fetchLeadFactRows, leadFactOf, loadStaff, targetsContext } from "@/lib/targets-server";
import { addDaysIso } from "@/lib/work-tasks";

const bodySchema = z.object({ from: dateStr.optional(), to: dateStr.optional() });

/** POST — a plain-language read of the lead numbers plus a coaching tip per salesperson. Managers only (it names everyone). */
export async function POST(request: Request) {
  const gate = await targetsContext("viewAllTargets");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  if (!ctx.perms.viewReports) return forbidden("You don't have permission to view reports");
  const db: SupabaseClient<Database> = ctx.db;
  const body = await parseBody(request, bodySchema);
  if ("error" in body) return body.error;

  const today = istDateString();
  const to = body.data.to ?? today;
  const from = body.data.from ?? addDaysIso(to, -30);
  try {
    const staff = await loadStaff(db);
    const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : "Not assigned");
    const facts = (await fetchLeadFactRows(db)).map(leadFactOf);
    const inRange = facts.filter((l) => (l.createdDate || "") >= from && (l.createdDate || "") <= to);
    const quietRows = await fetchAll((a, b) => db.from("leads").select("id, assigned_employee_id, stage, updated_at").order("id").range(a, b));
    const staleCutoff = `${addDaysIso(today, -7)}T00:00:00Z`;
    const staleByOwner = new Map<string | null, number>();
    for (const r of quietRows) if (isOpenStage(r.stage) && r.updated_at < staleCutoff) staleByOwner.set(r.assigned_employee_id, (staleByOwner.get(r.assigned_employee_id) ?? 0) + 1);

    const data = {
      period: { from, to },
      leadsCreated: inRange.length,
      winRatePercent: winRate(inRange),
      owners: ownerStats(inRange).map((o) => ({ name: nameOf(o.ownerId), leads: o.total, won: o.won, lost: o.lost, open: o.open, winRatePercent: o.winRate, wonValue: o.wonValue, avgDaysToWin: o.avgDaysToWin, openLeadsUntouched7Days: staleByOwner.get(o.ownerId) ?? 0 })),
      sources: sourceStats(inRange).slice(0, 6),
      lostReasons: lostReasonStats(inRange).slice(0, 5),
    };
    const out = await aiJson<{ headline?: string; bullets?: string[]; coaching?: { name?: string; tip?: string }[] }>(
      db,
      "insights",
      `${SHOP_VOICE}\nYou write a short weekly briefing for the owner of a tailoring/boutique shop from lead statistics. Answer in plain English as JSON: {"headline": one sentence, "bullets": 3 to 5 specific observations with the numbers (best source, biggest loss reason, who is ahead or behind, leads going cold), "coaching": [{"name": exactly a salesperson name from the data, "tip": one friendly, concrete tip based on THEIR numbers}] — only for people with at least 3 leads}. Be fair and constructive, never harsh. Do not invent numbers; if the data is thin, say so.`,
      [{ text: JSON.stringify(data) }]
    );
    const known = new Set(data.owners.map((o) => o.name));
    return NextResponse.json({
      headline: out.headline ?? "",
      bullets: (out.bullets ?? []).slice(0, 5),
      coaching: (out.coaching ?? []).filter((c) => c.name && c.tip && known.has(c.name)).slice(0, 10),
    });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
