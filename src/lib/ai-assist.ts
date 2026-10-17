import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveGeminiApiKey } from "@/lib/gemini-config";
import { istDateString } from "@/lib/ist-date";
import { AI_CONFIG_KEY, AI_FEATURES, AI_USAGE_KEY, aiFeatureOn, cleanAiConfig, type AiAssistConfig, type AiFeature } from "@/lib/ai-config";

/**
 * Server side of the AI helpers: checks the admin's switches and the shop's daily cap, then asks Gemini (the same key
 * Settings → AI Copilot already holds). Staff only ever get suggestions back — nothing here sends a message or
 * changes a record by itself.
 */

const MODEL = "gemini-flash-latest";

export class AiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function aiErrorResponse(e: unknown): NextResponse {
  if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: "The AI helper couldn't answer just now — please try again." }, { status: 502 });
}

export async function loadAiConfig(db: SupabaseClient<Database>): Promise<AiAssistConfig> {
  const { data } = await db.from("app_settings").select("value").eq("key", AI_CONFIG_KEY).maybeSingle();
  return cleanAiConfig(data?.value);
}

export async function aiUsageToday(db: SupabaseClient<Database>): Promise<number> {
  const { data } = await db.from("app_settings").select("value").eq("key", AI_USAGE_KEY).maybeSingle();
  const v = data?.value as { date?: string; count?: number } | null;
  return v?.date === istDateString() ? Number(v.count) || 0 : 0;
}

/** Throws if the feature is switched off or today's cap is used up; otherwise counts this call. */
export async function reserveAiCall(db: SupabaseClient<Database>, feature: AiFeature): Promise<void> {
  const config = await loadAiConfig(db);
  if (!aiFeatureOn(config, feature)) throw new AiError(`${AI_FEATURES[feature]} is switched off. An admin can turn it on in Settings → AI Helpers.`, 403);
  const used = await aiUsageToday(db);
  if (used >= config.dailyCap) throw new AiError(`The shop's AI limit for today (${config.dailyCap} requests) has been used. It resets tomorrow, or an admin can raise it in Settings → AI Helpers.`, 429);
  await db.from("app_settings").upsert({ key: AI_USAGE_KEY, value: { date: istDateString(), count: used + 1 } });
}

export type AiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

const retryable = (e: unknown) => /"code"\s*:\s*(503|429)\b|\b(UNAVAILABLE|RESOURCE_EXHAUSTED)\b/.test(e instanceof Error ? e.message : String(e));

async function generate(system: string, parts: AiPart[], json: boolean, temperature: number): Promise<string> {
  const apiKey = await resolveGeminiApiKey();
  if (!apiKey) throw new AiError("AI isn't set up yet — an admin needs to add the Gemini key under Settings → AI Copilot.", 501);
  const ai = new GoogleGenAI({ apiKey });
  const call = () =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: { systemInstruction: system, temperature, ...(json ? { responseMimeType: "application/json" } : {}) },
    });
  try {
    const res = await call().catch(async (e) => {
      if (!retryable(e)) throw e;
      await new Promise((r) => setTimeout(r, 800));
      return call();
    });
    return res.text?.trim() ?? "";
  } catch (e) {
    console.error("AI helper call failed:", e);
    throw new AiError("The AI helper couldn't answer just now — please try again.", 502);
  }
}

/** Plain-text answer. */
export async function aiText(db: SupabaseClient<Database>, feature: AiFeature, system: string, parts: AiPart[]): Promise<string> {
  await reserveAiCall(db, feature);
  const out = await generate(system, parts, false, 0.5);
  if (!out) throw new AiError("The AI helper returned nothing — please try again.", 502);
  return out;
}

/** JSON answer, parsed (Gemini sometimes wraps JSON in a code fence). */
export async function aiJson<T>(db: SupabaseClient<Database>, feature: AiFeature, system: string, parts: AiPart[]): Promise<T> {
  await reserveAiCall(db, feature);
  const out = await generate(system, parts, true, 0.3);
  try {
    return JSON.parse(out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")) as T;
  } catch {
    throw new AiError("The AI helper's answer couldn't be read — please try again.", 502);
  }
}

/** Customer-facing wording rules shared by every prompt. */
export const SHOP_VOICE = `You help the owner and staff of an Indian tailoring and fashion boutique. Write the way a warm, professional shop owner texts on WhatsApp: short, friendly, plain text, no markdown. Use ₹ for money. Reply in the customer's own language and script (English, Hindi, or Roman-script Hinglish — match how they wrote). Never invent prices, dates, or promises that are not in the data you are given; if something is unknown, say so or ask.`;
