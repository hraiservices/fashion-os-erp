import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_RATES, type RateCard } from "@/lib/business-rules";
import { aiErrorResponse, aiJson, aiText, SHOP_VOICE, type AiPart } from "@/lib/ai-assist";
import { istDateString } from "@/lib/ist-date";
import { LEAD_MEDIA_BUCKET } from "@/lib/lead-media";
import { LOST_REASONS } from "@/lib/lead-stages";
import { addDaysIso } from "@/lib/work-tasks";
import { badRequest, isUuid, notFound, parseBody, text, uuid } from "@/lib/targets-api";
import { addLeadActivity, customerSummaryForLead, leadVisible, mapLeadRow, targetsContext } from "@/lib/targets-server";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("brief") }),
  z.object({ action: z.literal("reply"), intent: text(200).optional() }),
  z.object({ action: z.literal("quote") }),
  z.object({ action: z.literal("lostreason") }),
  z.object({ action: z.literal("oneliner") }),
  z.object({ action: z.literal("spec"), attachmentId: uuid }),
  z.object({ action: z.literal("voice"), attachmentId: uuid }),
]);

/** Biggest photo / voice note we send to the AI inline. */
const MAX_AI_FILE_BYTES = 12 * 1024 * 1024;

async function leadContext(db: SupabaseClient<Database>, id: string) {
  const { data: row } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (!row) return null;
  const { data: acts } = await db.from("lead_activities").select("kind, body, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(40);
  return { row, lead: mapLeadRow(row), history: (acts || []).reverse() };
}

function describeLead(lead: ReturnType<typeof mapLeadRow>): string {
  const bits = [
    `Name: ${lead.name}`,
    `Stage: ${lead.stage}`,
    lead.source && `Source: ${lead.source}`,
    lead.productInterest && `Interested in: ${lead.productInterest}`,
    lead.outfitType && `Outfit: ${lead.outfitType}${lead.pieces ? ` × ${lead.pieces}` : ""}`,
    lead.neededBy && `Needed by: ${lead.neededBy}`,
    (lead.budgetMin || lead.budgetMax) && `Budget: ₹${lead.budgetMin || 0}–₹${lead.budgetMax || "?"}`,
    lead.expectedValue && `Expected value: ₹${lead.expectedValue}`,
    lead.measurements && `Measurements: ${lead.measurements}`,
    lead.notes && `Notes: ${lead.notes}`,
  ];
  return bits.filter(Boolean).join("\n");
}

const describeHistory = (history: { kind: string; body: string; created_at: string }[]) =>
  history.length ? history.map((h) => `[${h.created_at.slice(0, 10)}] ${h.kind}: ${h.body}`).join("\n") : "(no history yet)";

async function loadFile(db: SupabaseClient<Database>, leadId: string, attachmentId: string, kind: "image" | "audio") {
  const { data: att } = await db.from("lead_attachments").select("*").eq("id", attachmentId).eq("lead_id", leadId).maybeSingle();
  if (!att || att.kind !== kind) return { error: badRequest(kind === "image" ? "That isn't a photo on this lead" : "That isn't a voice note on this lead") };
  if (Number(att.size_bytes) > MAX_AI_FILE_BYTES) return { error: badRequest("That file is too large for the AI to read (over 12 MB)") };
  const { data: blob, error } = await db.storage.from(LEAD_MEDIA_BUCKET).download(att.path);
  if (error || !blob) return { error: badRequest("Couldn't open that file") };
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { part: { inlineData: { mimeType: att.content_type.split(";")[0] || (kind === "image" ? "image/jpeg" : "audio/ogg"), data: bytes.toString("base64") } } satisfies AiPart, name: att.name };
}

/** POST — one AI helper for a lead. Every answer is a suggestion for staff to review; nothing is sent to the customer. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  if (!isUuid(id)) return notFound("Lead not found");

  const body = await parseBody(request, bodySchema);
  if ("error" in body) return body.error;
  const d = body.data;

  const base = await leadContext(db, id);
  if (!base || !leadVisible(base.row, ctx)) return notFound("Lead not found");
  const { lead, history } = base;
  const facts = `LEAD\n${describeLead(lead)}\n\nHISTORY (oldest first)\n${describeHistory(history)}`;

  try {
    switch (d.action) {
      case "brief": {
        const customer = await customerSummaryForLead(db, lead.mobile).catch(() => null);
        const out = await aiJson<{ summary?: string; occasion?: string; budget?: string; taste?: string; objections?: string[]; nextStep?: string }>(
          db,
          "brief",
          `${SHOP_VOICE}\nYou are briefing a salesperson who is about to contact a lead. Answer in plain English as JSON: {"summary": 2 short sentences on where this lead stands, "occasion": what they need it for or "Not known", "budget": their budget or "Not known", "taste": style/colour/fabric preferences seen in the chat or "Not known", "objections": up to 3 worries or hesitations they showed (empty list if none), "nextStep": the single best next action, one sentence}. Use only facts in the data.`,
          [{ text: `${facts}${customer ? `\n\nEXISTING CUSTOMER: ${JSON.stringify(customer)}` : ""}` }],
          ctx.email
        );
        return NextResponse.json({ summary: out.summary ?? "", occasion: out.occasion ?? "Not known", budget: out.budget ?? "Not known", taste: out.taste ?? "Not known", objections: (out.objections ?? []).slice(0, 3), nextStep: out.nextStep ?? "" });
      }

      case "reply": {
        const reply = await aiText(
          db,
          "reply",
          `${SHOP_VOICE}\nDraft the next WhatsApp message from the shop to this lead, ready to send. ${d.intent ? `The staff member wants to: ${d.intent}.` : "Respond to what the customer said last, or if they have gone quiet, give a friendly nudge that moves the sale forward."} Keep it under 60 words, one clear question or next step, no placeholders. Output only the message.`,
          [{ text: facts }],
          ctx.email
        );
        return NextResponse.json({ text: reply.replace(/^["“]|["”]$/g, "") });
      }

      case "lostreason": {
        const out = await aiJson<{ reason?: string; why?: string }>(
          db,
          "lostreason",
          `${SHOP_VOICE}\nA salesperson is about to mark this lead as lost. From the lead and its chat/notes history, pick the single most likely reason from EXACTLY this list: ${JSON.stringify(LOST_REASONS)}. Answer as JSON: {"reason": one item from the list, copied exactly, or null if the history gives no clue, "why": one short sentence quoting or pointing at what in the history suggests it}. Never guess when the history is silent — use null.`,
          [{ text: facts }],
          ctx.email
        );
        const reason = (LOST_REASONS as readonly string[]).includes(String(out.reason)) ? String(out.reason) : null;
        return NextResponse.json({ reason, why: reason ? String(out.why ?? "").slice(0, 200) : "" });
      }

      case "oneliner": {
        const line = await aiText(
          db,
          "oneliner",
          `${SHOP_VOICE}\nSum up this lead in ONE plain-English sentence of at most 28 words for a salesperson glancing at the page: who they are, what they want, and the most important thing to do next. Use only facts in the data. No greeting, no markdown. Output only the sentence.`,
          [{ text: facts }],
          ctx.email
        );
        return NextResponse.json({ text: line.replace(/\s+/g, " ").slice(0, 240) });
      }

      case "spec": {
        const { data: ratesRow } = await db.from("app_settings").select("value").eq("key", "rates").maybeSingle();
        const rates = { ...DEFAULT_RATES, ...((ratesRow?.value as RateCard | null) ?? {}) };
        const types = Object.keys(rates);
        const file = await loadFile(db, id, d.attachmentId, "image");
        if ("error" in file) return file.error;
        const out = await aiJson<{ garment?: string; neckline?: string; sleeves?: string; fabric?: string; work?: string; colours?: string[]; notes?: string; rateCardType?: string | null }>(
          db,
          "spec",
          `You are a tailoring-shop assistant reading a customer's reference photo (a design they want stitched). Answer as JSON: {"garment": what it is, "neckline": ..., "sleeves": ..., "fabric": best guess, "work": embroidery/zari/print/lace details, "colours": [main colours], "notes": anything a tailor must know (fit, back design, dupatta, etc.), "rateCardType": the closest match from this exact list or null: ${JSON.stringify(types)}}. Use "Not clear" for anything you cannot see. Never invent details.`,
          [file.part, { text: "Describe the garment in this photo for the order." }],
          ctx.email
        );
        const rateCardType = types.find((t) => t === out.rateCardType) ?? null;
        return NextResponse.json({ garment: out.garment ?? "", neckline: out.neckline ?? "", sleeves: out.sleeves ?? "", fabric: out.fabric ?? "", work: out.work ?? "", colours: out.colours ?? [], notes: out.notes ?? "", rateCardType });
      }

      case "voice": {
        const file = await loadFile(db, id, d.attachmentId, "audio");
        if ("error" in file) return file.error;
        const out = await aiJson<{ transcript?: string; summary?: string; actions?: string[] }>(
          db,
          "voice",
          `You listen to a voice note a customer sent a tailoring shop (English, Hindi or Hinglish). Answer as JSON: {"transcript": the words spoken, in the language/script spoken, not translated, "summary": one or two English sentences, "actions": short English to-dos for the shop (empty list if none)}. If it is silent or unclear, transcript "(could not transcribe)".`,
          [file.part, { text: "Transcribe and summarise this voice note." }],
          ctx.email
        );
        const transcript = (out.transcript ?? "").trim();
        const summary = (out.summary ?? "").trim();
        const actions = (out.actions ?? []).slice(0, 5);
        if (transcript && transcript !== "(could not transcribe)") {
          await addLeadActivity(db, id, "note", `Voice note (${file.name}): ${summary}${actions.length ? ` To do: ${actions.join("; ")}.` : ""} — "${transcript.slice(0, 600)}"`, ctx.email);
        }
        return NextResponse.json({ transcript, summary, actions });
      }

      case "quote": {
        const { data: ratesRow } = await db.from("app_settings").select("value").eq("key", "rates").maybeSingle();
        const rates = { ...DEFAULT_RATES, ...((ratesRow?.value as RateCard | null) ?? {}) };
        const types = Object.keys(rates);
        const { count: open } = await db.from("orders").select("id", { count: "exact", head: true }).in("status", ["received", "cutting", "stitching", "finishing"]);
        const out = await aiJson<{ items?: { type?: string; qty?: number }[]; deliveryDays?: number; notes?: string }>(
          db,
          "quote",
          `${SHOP_VOICE}\nPropose a stitching quote for this lead. Answer as JSON: {"items": [{"type": exactly one of ${JSON.stringify(types)}, "qty": whole number}], "deliveryDays": realistic days from today to finish (the shop currently has ${open ?? 0} orders in progress; a single garment normally takes about 7 days, more orders in progress means longer), "notes": one short sentence for staff on what you assumed}. Pick only garments the customer asked for or clearly needs; if unsure return fewer items. Prices are added by the system — do not give prices.`,
          [{ text: facts }],
          ctx.email
        );
        const items = (out.items ?? [])
          .filter((i): i is { type: string; qty?: number } => !!i.type && types.includes(i.type))
          .map((i) => ({ type: i.type, qty: Math.min(20, Math.max(1, Math.round(Number(i.qty) || 1))), price: Number(rates[i.type]?.s) || 0 }));
        const deliveryDays = Math.min(120, Math.max(1, Math.round(Number(out.deliveryDays) || 7)));
        const finish = addDaysIso(istDateString(), deliveryDays);
        return NextResponse.json({
          items,
          total: items.reduce((s, i) => s + i.price * i.qty, 0),
          deliveryDays,
          fitsDeadline: lead.neededBy ? finish <= lead.neededBy : null,
          notes: out.notes ?? "",
        });
      }
    }
  } catch (e) {
    return aiErrorResponse(e);
  }
}
