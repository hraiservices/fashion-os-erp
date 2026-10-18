import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveGeminiApiKey } from "@/lib/gemini-config";
import { istDateString } from "@/lib/ist-date";
import { AI_CONFIG_KEY, AI_FEATURES, AI_LOG_KEY, AI_USAGE_KEY, type AiUsageLog, aiFeatureOn, cleanAiConfig, type AiAssistConfig, type AiFeature } from "@/lib/ai-config";

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

export async function loadAiLog(db: SupabaseClient<Database>): Promise<AiUsageLog> {
  const { data } = await db.from("app_settings").select("value").eq("key", AI_LOG_KEY).maybeSingle();
  const v = (data?.value ?? {}) as Partial<AiUsageLog>;
  return { days: v.days && typeof v.days === "object" ? v.days : {}, users: v.users && typeof v.users === "object" ? v.users : {} };
}

/** Records one call in the usage log (best effort — a failure here never blocks the AI answer). */
async function logAiCall(db: SupabaseClient<Database>, feature: AiFeature, who?: string): Promise<void> {
  try {
    const log = await loadAiLog(db);
    const today = istDateString();
    log.days[today] = { ...(log.days[today] ?? {}), [feature]: (log.days[today]?.[feature] ?? 0) + 1 };
    // Keep 30 days.
    for (const d of Object.keys(log.days).sort().slice(0, Math.max(0, Object.keys(log.days).length - 30))) delete log.days[d];
    if (who) log.users[who] = (log.users[who] ?? 0) + 1;
    // The per-person tally is a running 30-day-ish total: trim to the 50 busiest so it can't grow without bound.
    const top = Object.entries(log.users).sort((a, b) => b[1] - a[1]).slice(0, 50);
    log.users = Object.fromEntries(top);
    await db.from("app_settings").upsert({ key: AI_LOG_KEY, value: JSON.parse(JSON.stringify(log)) });
  } catch {
    /* usage logging is informational */
  }
}

/** Throws if the feature is switched off or today's cap is used up; otherwise counts this call. */
export async function reserveAiCall(db: SupabaseClient<Database>, feature: AiFeature, who?: string, weight = 1): Promise<void> {
  const config = await loadAiConfig(db);
  if (!aiFeatureOn(config, feature)) throw new AiError(`${AI_FEATURES[feature]} is switched off. An admin can turn it on in Settings → AI Helpers.`, 403);
  const used = await aiUsageToday(db);
  if (used + weight > config.dailyCap) throw new AiError(`The shop's AI limit for today (${config.dailyCap} requests) has been used. It resets tomorrow, or an admin can raise it in Settings → AI Helpers.`, 429);
  await db.from("app_settings").upsert({ key: AI_USAGE_KEY, value: { date: istDateString(), count: used + weight } });
  await logAiCall(db, feature, who);
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
export async function aiText(db: SupabaseClient<Database>, feature: AiFeature, system: string, parts: AiPart[], who?: string): Promise<string> {
  await reserveAiCall(db, feature, who);
  const out = await generate(system, parts, false, 0.5);
  if (!out) throw new AiError("The AI helper returned nothing — please try again.", 502);
  return out;
}

/** JSON answer, parsed (Gemini sometimes wraps JSON in a code fence). */
export async function aiJson<T>(db: SupabaseClient<Database>, feature: AiFeature, system: string, parts: AiPart[], who?: string): Promise<T> {
  await reserveAiCall(db, feature, who);
  const out = await generate(system, parts, true, 0.3);
  try {
    return JSON.parse(out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")) as T;
  } catch {
    throw new AiError("The AI helper's answer couldn't be read — please try again.", 502);
  }
}

/** Customer-facing wording rules shared by every prompt. */
export const SHOP_VOICE = `You help the owner and staff of an Indian tailoring and fashion boutique. Write the way a warm, professional shop owner texts on WhatsApp: short, friendly, plain text, no markdown. Use ₹ for money. Reply in the customer's own language and script (English, Hindi, or Roman-script Hinglish — match how they wrote). Never invent prices, dates, or promises that are not in the data you are given; if something is unknown, say so or ask.`;

/** Image models cost more per call, so a generated picture counts as this many requests against the daily cap. */
const IMAGE_CALL_WEIGHT = 3;
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

/** Asks Gemini to make a picture. Returns the first image it sends back. */
export async function aiImage(db: SupabaseClient<Database>, feature: AiFeature, prompt: string, images: { mimeType: string; data: string }[], who?: string): Promise<{ mimeType: string; data: string }> {
  await reserveAiCall(db, feature, who, IMAGE_CALL_WEIGHT);
  const apiKey = await resolveGeminiApiKey();
  if (!apiKey) throw new AiError("AI isn't set up yet — an admin needs to add the Gemini key under Settings → AI Copilot.", 501);
  const ai = new GoogleGenAI({ apiKey });
  try {
    const res = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts: [...images.map((i) => ({ inlineData: i })), { text: prompt }] }],
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) throw new AiError("The AI didn't return a picture this time — try a clearer photo.", 502);
    return { mimeType: part.inlineData.mimeType || "image/png", data: part.inlineData.data };
  } catch (e) {
    if (e instanceof AiError) throw e;
    console.error("AI image call failed:", e);
    throw new AiError("The picture preview couldn't be made just now — please try again.", 502);
  }
}
