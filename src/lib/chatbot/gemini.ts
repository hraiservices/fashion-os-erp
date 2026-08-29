import { GoogleGenAI, Type } from "@google/genai";
import type { GlossaryEntry } from "@/lib/chatbot/glossary";
import { toMKey } from "@/lib/measurements";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured — add it to .env.local");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

// "latest" alias rather than a pinned version — the pinned "gemini-2.5-flash" tag is listed
// by the API as existing but rejects generateContent for newer API keys ("no longer
// available to new users"), so the alias avoids this recurring every time Google rotates
// which dated model tag is actually servable.
const MODEL = "gemini-flash-latest";

/**
 * Everything the model needs to know about the two views it's allowed to query, plus the
 * business rules that are non-obvious from the column names alone. These are exactly the
 * rules that caused real reporting bugs elsewhere in this app when duplicated ad hoc — see
 * the audit that preceded this chatbot's design.
 */
const SCHEMA_CONTEXT = `
You can query exactly these five PostgreSQL views. Do not reference any other table or view —
you have no access to them and the query will fail.

TABLE v_chatbot_orders (custom tailoring orders):
  id text, customer_name text, customer_mobile text, in_date date, delivery_date date,
  total integer, advance integer, balance integer, status text, tailor text,
  is_overdue boolean, days_overdue integer, created_at timestamptz

  - status is one of: 'received', 'cutting', 'stitching', 'ready', 'delivered', 'payment'.
    'payment' means delivered and fully paid; 'delivered' means delivered but balance may
    still be owed.
  - balance is already the correct amount owed — never recompute it as total - advance
    yourself, the column is authoritative.
  - is_overdue and days_overdue already account for delivered/paid orders being excluded —
    use them directly rather than comparing delivery_date to CURRENT_DATE yourself.

TABLE v_chatbot_invoices (product sales invoices, separate from tailoring orders):
  id uuid, invoice_number text, customer_name text, customer_mobile text,
  invoice_date date, due_date date, total numeric, paid_total numeric, credits_total numeric,
  balance numeric, payment_status text, is_overdue boolean, created_at timestamptz

  - payment_status is one of: 'unpaid', 'partial', 'paid'. Only 'paid' means fully settled —
    never describe a 'partial' invoice as paid.
  - balance already accounts for payments and credit notes — it is authoritative.

TABLE v_chatbot_expenses (shop expenses — rent, salaries, supplies, etc.):
  id uuid, date date, category text, description text, amount numeric, pay_method text,
  customer_name text (nullable), customer_mobile text (nullable), created_at timestamptz

  - customer_name/customer_mobile are only set for expenses linked to a specific customer
    (rare) — most rows have them null.

TABLE v_chatbot_payments (money actually received — both stitching-order and product-sale
payments combined into one ledger, separate from an order/invoice's running balance):
  id uuid, source text, reference_id text, customer_name text, customer_mobile text,
  amount numeric, method text, date date, created_at timestamptz

  - source is 'order' (stitching order payment) or 'invoice' (product sale payment).
  - Use this view (not v_chatbot_orders.advance or v_chatbot_invoices.paid_total) for
    "how much did I collect today/this week/this month" style questions — those columns are
    running totals, not individual payment events, so they can't answer "on what day."

TABLE v_chatbot_inventory (products and raw materials, with current stock level):
  id text, item_type text, name text, sku text (nullable, raw materials have none),
  category text, stock_qty integer, low_stock_alert integer, is_low_stock boolean

  - item_type is 'product' (finished goods for sale) or 'raw_material' (fabric etc. used in
    stitching).
  - is_low_stock is already computed (stock_qty <= low_stock_alert) — use it directly.

Business context: this is an Indian tailoring shop. Money is in Indian Rupees (₹). "Revenue"
or "business" spans both v_chatbot_orders.total and v_chatbot_invoices.total — combine both
unless the question is clearly about only one. Today's date is {{TODAY}}.
`;

const SQL_SYSTEM_PROMPT = `You are a PostgreSQL query generator for a tailoring-shop ERP chatbot.
${SCHEMA_CONTEXT}
Given a business question (which may be in English, Hindi written in Roman script, or a mix of
both), write exactly one read-only SELECT statement that answers it.

Rules:
- SELECT only. Never write INSERT, UPDATE, DELETE, or any DDL.
- Exactly one statement — no semicolons except an optional single trailing one.
- Only reference the five views listed above.
- Prefer aggregates (COUNT, SUM, AVG) with clear column aliases when the question asks "how
  many" or "how much".
- If the question truly cannot be answered from these views, return a query that selects
  nothing meaningful is not allowed — instead set "sql" to an empty string.
Respond with JSON only: {"sql": "<the query>"}.`;

const ANSWER_SYSTEM_PROMPT = `You are a friendly, sharp business assistant for an Indian
tailoring shop's ERP. You'll be given the original question, any recent conversation context,
and the JSON rows a database query returned. Turn that into a concise, actionable answer.

Rules:
- Reply in the same language / language-mix as the question (Hinglish → Hinglish; English → English).
- Lead with the most important number or fact.
- Use ₹ for currency, state real numbers — don't round or hedge unnecessarily.
- If the rows array is empty, say so clearly and suggest what they might try instead.
- For lists of 5 or fewer items, name them. For longer lists give the count and top examples.
- Keep it short and conversational — 1-3 sentences or a tight bullet list. No markdown tables, no code blocks.
- If the answer implies something actionable (overdue balance, pending delivery), say so.
- Also suggest 2-3 short, natural follow-up questions the owner would plausibly ask next, in
  the same language/mix as the question. Keep each under 8 words. Skip a follow-up that's
  basically a restatement of what was just answered.
Respond with JSON only: {"answer": "<the answer>", "followups": ["<short question>", ...]}.`;

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

export async function generateSql(
  question: string,
  glossary: GlossaryEntry[] = [],
  history: { question: string; answer: string }[] = [],
): Promise<string> {
  const ai = getClient();
  const today = new Date().toISOString().slice(0, 10);
  const systemInstruction =
    SQL_SYSTEM_PROMPT.replace("{{TODAY}}", today) +
    buildGlossaryBlock(glossary) +
    buildHistoryBlock(history);
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: question }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { sql: { type: Type.STRING } },
        required: ["sql"],
      },
      temperature: 0,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Empty response from the model");
  const parsed = JSON.parse(text) as { sql?: string };
  if (!parsed.sql) throw new Error("The question couldn't be turned into a query");
  return parsed.sql;
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
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: `Today's business summary (JSON): ${JSON.stringify(summary)}` }] }],
    config: {
      systemInstruction: BRIEFING_SYSTEM_PROMPT,
      temperature: 0.3,
    },
  });
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
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: `Customer's message: ${question}\n\nTheir recent orders (JSON, may be empty): ${JSON.stringify(orders).slice(0, 4000)}` }],
      },
    ],
    config: { systemInstruction: CONCIERGE_SYSTEM_PROMPT, temperature: 0.2 },
  });
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

  const ai = getClient();
  const prompt = MEASUREMENT_EXTRACTION_PROMPT.replace("{{FIELDS}}", fieldLabels.map((f) => `- ${f}`).join("\n"));
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }] }],
    config: { responseMimeType: "application/json", temperature: 0 },
  });

  const text = response.text;
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as { values?: Record<string, string> };
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

export interface GeneratedAnswer {
  answer: string;
  followups: string[];
}

export async function generateAnswer(
  question: string,
  rows: unknown[],
  history: { question: string; answer: string }[] = [],
): Promise<GeneratedAnswer> {
  const ai = getClient();
  const historyBlock = history.length
    ? `\n\nPrior conversation:\n${history.map((h) => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n")}`
    : "";
  const fallback = { answer: "I couldn't turn that into an answer — try rephrasing the question.", followups: [] };
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: `Question: ${question}${historyBlock}\n\nQuery result (JSON array, may be empty): ${JSON.stringify(rows).slice(0, 8000)}` }],
      },
    ],
    config: {
      systemInstruction: ANSWER_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING },
          followups: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["answer", "followups"],
      },
      temperature: 0.3,
    },
  });
  const text = response.text;
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { answer?: string; followups?: string[] };
    if (!parsed.answer) return fallback;
    return { answer: parsed.answer, followups: (parsed.followups || []).slice(0, 3) };
  } catch {
    return fallback;
  }
}
