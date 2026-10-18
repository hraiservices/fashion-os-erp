import { NextResponse } from "next/server";
import { z } from "zod";
import { aiErrorResponse, aiJson, SHOP_VOICE } from "@/lib/ai-assist";
import { istDateString } from "@/lib/ist-date";
import { parseBody, text } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";

const bodySchema = z.object({
  items: z.array(z.object({ name: text(80), why: text(160), stage: text(30), heat: text(10), value: z.number().min(0).max(1e9) })).max(40),
  risks: z.array(text(160)).max(15).default([]),
});

/** POST — orders the Today list into a short plan. The page sends the leads it already loaded (so visibility rules already applied). */
export async function POST(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const body = await parseBody(request, bodySchema);
  if ("error" in body) return body.error;
  if (!body.data.items.length && !body.data.risks.length) return NextResponse.json({ plan: ["Nothing urgent today — a good day to reach out to older leads."] });
  try {
    const out = await aiJson<{ plan?: string[] }>(
      gate.ctx.db,
      "plan",
      `${SHOP_VOICE}\nToday is ${istDateString()}. You plan a salesperson's day. Given today's leads to contact and orders at risk of missing delivery, answer as JSON: {"plan": [up to 6 short English steps in the order to do them, each naming the person or order and what to do — e.g. "Call Meera first — quote sent 5 days ago, hot lead, ₹18,000"]}. Put time-critical and high-value items first. Use only the data given.`,
      [{ text: JSON.stringify(body.data) }],
      gate.ctx.email
    );
    return NextResponse.json({ plan: (out.plan ?? []).filter((s) => typeof s === "string" && s.trim()).slice(0, 6) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
