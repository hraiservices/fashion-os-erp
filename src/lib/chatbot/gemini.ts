import { GoogleGenAI, Type, type Content } from "@google/genai";
import type { GlossaryEntry } from "@/lib/chatbot/glossary";
import { toMKey } from "@/lib/measurements";
import { istDateString } from "@/lib/ist-date";
import { resolveGeminiApiKey } from "@/lib/gemini-config";
import { TOOL_DECLARATIONS, executeTool } from "@/lib/chatbot/tools";

/** Thrown when neither GEMINI_API_KEY nor the Settings → AI Copilot key is configured — callers
 *  (chatbot route) match on this to give a specific "not configured" answer instead of the
 *  generic "couldn't find an answer" every other failure gets. */
export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("The AI Copilot isn't configured yet — ask your admin to add a Gemini API key under Settings → AI Copilot.");
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
 * The tool-calling system prompt. Unlike the old SQL-generation design, the model here never
 * writes a query — it only picks one of the named tools in TOOL_DECLARATIONS and fills in
 * their (few, typed) arguments. Each tool is a fixed, hand-reviewed query (see tools.ts); the
 * model's only real job is matching a business question to the right tool and date range.
 */
const AGENT_SYSTEM_PROMPT = `You are a friendly, sharp business assistant for an Indian tailoring shop's ERP
(custom stitching orders + product sales). Money is in Indian Rupees (₹). Today's date is
{{TODAY}}.

You have tools that look up real, live data — orders, invoices, payments, expenses, inventory,
tailor workload. Given a business question (which may be in English, Hindi written in Roman
script, or a mix of both):

- Call whichever tool(s) answer it. Call more than one if the question needs it (e.g. "revenue
  and low stock" needs two tools). You may call tools in more than one turn if an answer needs
  a follow-up lookup.
- Never guess a number — if no tool covers the question, say so honestly instead of making one up.
- "Stitching orders" / "tailoring orders" is the generic name for ALL rows in the orders tools —
  not a status filter. Only filter by a pipeline stage when the question is clearly about one.
- Once you have what you need, reply directly (no more tool calls) with the final answer.

Answer rules:
- Reply in the same language/mix as the question (Hinglish → Hinglish; English → English).
- Lead with the most important number or fact. Use ₹ for currency, state real numbers.
- If a tool returned no rows, say so clearly and suggest what they might try instead.
- For lists of 5 or fewer items, name them. For longer lists give the count and top examples.
- Keep it short and conversational — 1-3 sentences or a tight bullet list. No markdown tables, no code blocks.
- If the answer implies something actionable (overdue balance, pending delivery), say so.`;

const FOLLOWUPS_SYSTEM_PROMPT = `Given a business question and the answer just given to an Indian tailoring shop
owner, suggest 2-3 short, natural follow-up questions they'd plausibly ask next, in the same
language/mix as the question. Keep each under 8 words. Skip anything that's basically a
restatement of what was just answered.
Respond with JSON only: {"followups": ["<short question>", ...]}.`;

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

function buildGlossaryBlock(glossary: GlossaryEntry[]): string {
  if (!glossary.length) return "";
  const lines = glossary.map((g) => `- "${g.term}": ${g.meaning}`).join("\n");
  return `\n\nBUSINESS VOCABULARY (set by the shop admin — these override your own guesses about what a term means):\n${lines}`;
}

function buildHistoryBlock(history: { question: string; answer: string }[]): string {
  if (!history.length) return "";
  const lines = history.map((h) => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n");
  return `\n\nRECENT CONVERSATION (last ${history.length} turns — use for context when the new question is a follow-up):\n${lines}`;
}

export interface AgentTurnResult {
  answer: string;
  /** Every tool call made while answering, in order — persisted for audit/debugging in place
   *  of the old `generated_sql` column, and used by the route to build result-chip links. */
  toolCalls: { name: string; args: Record<string, unknown>; result: unknown }[];
}

const MAX_TOOL_ROUNDS = 4;

/**
 * Runs the full tool-calling agent loop for one question: the model calls zero or more tools
 * (each a fixed query from tools.ts — see executeTool), sees their results, and keeps going
 * until it has enough to answer directly with no more calls, or MAX_TOOL_ROUNDS is hit.
 */
export async function runAgentTurn(
  question: string,
  glossary: GlossaryEntry[] = [],
  history: { question: string; answer: string }[] = [],
): Promise<AgentTurnResult> {
  const ai = await getClient();
  const today = istDateString();
  const systemInstruction =
    AGENT_SYSTEM_PROMPT.replace("{{TODAY}}", today) +
    buildGlossaryBlock(glossary) +
    buildHistoryBlock(history);

  const contents: Content[] = [{ role: "user", parts: [{ text: question }] }];
  const toolCalls: AgentTurnResult["toolCalls"] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          temperature: 0,
        },
      })
    );

    const candidateParts = response.candidates?.[0]?.content?.parts || [];
    const functionCalls = candidateParts.filter((p) => p.functionCall).map((p) => p.functionCall!);

    if (functionCalls.length === 0) {
      const answer = response.text?.trim();
      if (!answer) throw new Error("Empty response from the model");
      return { answer, toolCalls };
    }

    contents.push({ role: "model", parts: candidateParts });

    const responseParts = [];
    for (const call of functionCalls) {
      const name = call.name || "";
      const args = (call.args || {}) as Record<string, unknown>;
      let result: unknown;
      try {
        result = await executeTool(name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Tool failed" };
      }
      toolCalls.push({ name, args, result });
      responseParts.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  throw new Error("The question needed too many lookups to answer — try breaking it into smaller questions");
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

/**
 * A short, cheap second call purely for follow-up suggestions — kept separate from the main
 * tool-calling turn so a failure here (or the model preferring not to suggest any) never
 * threatens the actual answer the user is waiting on.
 */
export async function generateFollowups(question: string, answer: string): Promise<string[]> {
  const ai = await getClient();
  try {
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: `Question: ${question}\n\nAnswer given: ${answer}` }] }],
        config: {
          systemInstruction: FOLLOWUPS_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { followups: { type: Type.ARRAY, items: { type: Type.STRING } } },
            required: ["followups"],
          },
          temperature: 0.3,
        },
      })
    );
    const text = response.text;
    if (!text) return [];
    const parsed = parseJsonResponse<{ followups?: string[] }>(text);
    return (parsed.followups || []).slice(0, 3);
  } catch {
    return [];
  }
}
