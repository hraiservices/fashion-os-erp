import { GoogleGenAI } from "@google/genai";
import { toMKey } from "@/lib/measurements";
import { resolveGeminiApiKey } from "@/lib/gemini-config";

/** Thrown when neither GEMINI_API_KEY nor the Settings → AI Copilot key is configured — callers
 *  match on this to give a specific "not configured" answer instead of the generic failure
 *  message every other error gets. The Copilot's own Q&A engine no longer uses Gemini (see
 *  src/lib/chatbot/claude.ts) — this now only gates the daily briefing, WhatsApp concierge
 *  replies, measurement-photo OCR, and voice-note transcription below. */
export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("This AI feature isn't configured yet — ask your admin to add a Gemini API key under Settings → AI Copilot.");
    this.name = "GeminiNotConfiguredError";
  }
}

// Deliberately not cached across calls — an admin saving a new/corrected key in Settings must
// take effect on the very next question, not after a redeploy or server restart.
async function getClient(): Promise<GoogleGenAI> {
  const apiKey = await resolveGeminiApiKey();
  if (!apiKey) throw new GeminiNotConfiguredError();
  return new GoogleGenAI({ apiKey });
}

// "latest" alias rather than a pinned version — the pinned "gemini-2.5-flash" tag is listed
// by the API as existing but rejects generateContent for newer API keys ("no longer
// available to new users"), so the alias avoids this recurring every time Google rotates
// which dated model tag is actually servable.
const MODEL = "gemini-flash-latest";

/**
 * "This model is currently experiencing high demand" (503 UNAVAILABLE) is a real, common,
 * genuinely transient condition on the shared/free Gemini tier — confirmed as the cause of a
 * live "AI Copilot never answers" report, where it failed the very first call (generateSql,
 * before any query even existed) and the whole question died with it. Nothing about the
 * question was wrong; the model was momentarily overloaded. One retry with a short backoff
 * turns "every question has a chance of failing outright" into "occasionally half a second
 * slower," which is the actual fix — no amount of prompt or parsing work addresses a 503.
 *
 * 429 (RESOURCE_EXHAUSTED / rate limit) is bundled in for the same reason: also transient, also
 * resolved by waiting a moment, and indistinguishable from 503 as far as the caller is concerned.
 */
function isRetryableGeminiError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /"code"\s*:\s*(503|429)\b/.test(message) || /\b(UNAVAILABLE|RESOURCE_EXHAUSTED)\b/.test(message);
}

async function withGeminiRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isRetryableGeminiError(e)) throw e;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return fn();
  }
}

/**
 * `responseMimeType: "application/json"` is a strong hint, not a guarantee — Gemini
 * occasionally wraps the JSON in a ```json ... ``` fence anyway (a known, intermittent quirk,
 * not tied to any one question). A bare `JSON.parse` on that raw text throws, and generateSql
 * had no try/catch around its parse at all, so this single-line issue surfaced as "AI Copilot
 * is broken" for whatever question happened to trigger it, indistinguishable from a question
 * that's genuinely out of scope.
 */
function parseJsonResponse<T>(text: string): T {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(stripped) as T;
}

const BRIEFING_SYSTEM_PROMPT = `You are a friendly, precise business assistant writing a short daily briefing for the
owner of an Indian tailoring shop + product sales business. You'll be given a JSON summary of
today's key numbers. Turn it into 3-5 short sentences (or a tight bulleted list) highlighting
what needs attention today — overdue balances, low stock, and today's activity so far.

Rules:
- Lead with whatever is most actionable (overdue money, low stock) — don't bury it.
- Use ₹ for currency, state actual numbers.
- If everything is quiet (no overdue, no low stock), say so briefly and positively — don't pad.
- Keep it conversational, no markdown tables or code blocks. A short bulleted list is fine.`;

export async function generateBriefing(summary: unknown): Promise<string> {
  const ai = await getClient();
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: `Today's business summary (JSON): ${JSON.stringify(summary)}` }] }],
      config: {
        systemInstruction: BRIEFING_SYSTEM_PROMPT,
        temperature: 0.3,
      },
    })
  );
  return response.text?.trim() || "Couldn't generate today's briefing — try again shortly.";
}

const CONCIERGE_SYSTEM_PROMPT = `You are a WhatsApp assistant for an Indian tailoring shop, replying directly to ONE
customer about their OWN stitching orders only. You will be given their message and a JSON list
of their own recent orders (already filtered to just them by their WhatsApp number — never
imply or mention anything about any other customer).

Rules:
- Reply in the same language/mix as their message (Hinglish -> Hinglish, English -> English).
- Be short and direct — 1-3 sentences, plain WhatsApp-style text, no markdown, no code blocks.
- Use ₹ for money, state the real numbers from the data given.
- If the order list is empty, say you couldn't find any order under this number and suggest
  they contact the shop directly — don't guess.
- Never invent a status, date, or amount that isn't in the data you were given.
- You cannot take any action (can't change a date, cancel, or record a payment) — if asked to
  do one of those, say to contact the shop directly instead.
Respond with plain text only — no JSON, no quotes around the whole message.`;

/**
 * Generates the concierge's reply to an inbound WhatsApp message — used only by the
 * order-status webhook (src/app/api/webhooks/whatsapp/route.ts), never by the in-app Copilot.
 * Deliberately much narrower than generateAnswer(): the caller has already fetched exactly
 * this one customer's own orders via a plain `WHERE mobile = ?` query (never an LLM-generated
 * one), so there's no SQL-generation step and no way for the reply to reach another customer's
 * data — Gemini's only job here is phrasing, on data it never chose itself.
 */
export async function generateConciergeReply(question: string, orders: unknown[]): Promise<string> {
  const ai = await getClient();
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `Customer's message: ${question}\n\nTheir recent orders (JSON, may be empty): ${JSON.stringify(orders).slice(0, 4000)}` }],
        },
      ],
      config: { systemInstruction: CONCIERGE_SYSTEM_PROMPT, temperature: 0.2 },
    })
  );
  return response.text?.trim() || "Sorry, I couldn't look that up right now — please contact the shop directly.";
}

const MEASUREMENT_EXTRACTION_PROMPT = `You are reading a photo of a handwritten or printed tailoring measurement chart for an
Indian tailoring shop. Extract numeric values for exactly these fields:
{{FIELDS}}

Rules:
- Match values to fields using whatever labels/handwriting appear on the chart — they may be
  abbreviated, in Hindi, or listed in a different order than above.
- Only include a field if you can read a clear number for it. Never guess, estimate, or carry
  a value over from a similar-looking field — leave it out entirely instead.
- Return each value as the number only (e.g. "38", "38.5"), no units or extra text.
Respond with JSON only: {"values": {"<field label exactly as given above>": "<number>", ...}}`;

/**
 * Reads a photo of a paper measurement chart and returns a { measurement-key: value } map
 * ready to merge into the order form's measurement grid — the shop still reviews/edits every
 * value before saving, this only replaces re-typing what's already on the paper. Uses the same
 * Gemini client as the rest of this module, just with an image input instead of text-only.
 */
export async function extractMeasurementsFromImage(imageDataUrl: string, fieldLabels: string[]): Promise<Record<string, string>> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);
  if (!match) throw new Error("Invalid image");
  const [, mimeType, base64] = match;

  const ai = await getClient();
  const prompt = MEASUREMENT_EXTRACTION_PROMPT.replace("{{FIELDS}}", fieldLabels.map((f) => `- ${f}`).join("\n"));
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0 },
    })
  );

  const text = response.text;
  if (!text) return {};
  try {
    const parsed = parseJsonResponse<{ values?: Record<string, string> }>(text);
    const out: Record<string, string> = {};
    for (const [label, value] of Object.entries(parsed.values || {})) {
      const trimmed = String(value ?? "").trim();
      if (trimmed) out[toMKey(label)] = trimmed;
    }
    return out;
  } catch {
    return {};
  }
}

const VOICE_NOTE_TRANSCRIPTION_PROMPT = `Transcribe this voice note from an Indian tailoring shop. It may be in English, Hindi, or a
mix (Hinglish) — transcribe it in whatever language/script it's actually spoken in (Hindi in
Devanagari, Hinglish in Roman script), don't translate it. Output ONLY the transcription itself
— no preamble, no "Here is the transcription," no quotes around it. If the audio is silent or
unintelligible, output exactly: (could not transcribe)`;

/**
 * Transcribes a tailor's voice note (recorded on the order form, see MediaCapture) into text
 * for the Special Instructions field — so nobody has to replay it to know what was said.
 * Doesn't try to summarize or act on the content, only transcribe it verbatim.
 */
export async function transcribeVoiceNote(audioDataUrl: string): Promise<string> {
  const match = /^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(audioDataUrl);
  if (!match) throw new Error("Invalid audio");
  const [, mimeType, base64] = match;

  const ai = await getClient();
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: base64 } }, { text: VOICE_NOTE_TRANSCRIPTION_PROMPT }] }],
      config: { temperature: 0 },
    })
  );
  return response.text?.trim() || "(could not transcribe)";
}
