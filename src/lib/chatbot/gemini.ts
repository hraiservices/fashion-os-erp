import { GoogleGenAI, Type } from "@google/genai";
import type { GlossaryEntry } from "@/lib/chatbot/glossary";

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
You can query exactly two PostgreSQL views. Do not reference any other table or view — you have
no access to them and the query will fail.

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

Business context: this is an Indian tailoring shop. Money is in Indian Rupees (₹). "Revenue"
or "business" spans both tables — tailoring orders (v_chatbot_orders.total) AND product sales
(v_chatbot_invoices.total) — combine both unless the question is clearly about only one.
Today's date is {{TODAY}}.
`;

const SQL_SYSTEM_PROMPT = `You are a PostgreSQL query generator for a tailoring-shop ERP chatbot.
${SCHEMA_CONTEXT}
Given a business question (which may be in English, Hindi written in Roman script, or a mix of
both), write exactly one read-only SELECT statement that answers it.

Rules:
- SELECT only. Never write INSERT, UPDATE, DELETE, or any DDL.
- Exactly one statement — no semicolons except an optional single trailing one.
- Only reference v_chatbot_orders and v_chatbot_invoices.
- Prefer aggregates (COUNT, SUM, AVG) with clear column aliases when the question asks "how
  many" or "how much".
- If the question truly cannot be answered from these two views, return a query that selects
  nothing meaningful is not allowed — instead set "sql" to an empty string.
Respond with JSON only: {"sql": "<the query>"}.`;

const ANSWER_SYSTEM_PROMPT = `You are a friendly, precise business assistant for a tailoring
shop's ERP. You'll be given the original question and the JSON rows a database query returned
for it. Turn that into a short, direct natural-language answer.

Rules:
- Reply in the same language / language-mix the question was asked in (if it was Hinglish,
  answer in Hinglish; if English, answer in English).
- State the actual numbers from the data — don't round unnecessarily, use ₹ for currency.
- If the rows are empty, say so plainly rather than guessing.
- Keep it conversational and short — a sentence or two, occasionally a short list for multiple
  items. No markdown tables, no code blocks.`;

function buildGlossaryBlock(glossary: GlossaryEntry[]): string {
  if (!glossary.length) return "";
  const lines = glossary.map((g) => `- "${g.term}": ${g.meaning}`).join("\n");
  return `\n\nBUSINESS VOCABULARY (set by the shop admin — these override your own guesses about what a term means):\n${lines}`;
}

export async function generateSql(question: string, glossary: GlossaryEntry[] = []): Promise<string> {
  const ai = getClient();
  const today = new Date().toISOString().slice(0, 10);
  const systemInstruction = SQL_SYSTEM_PROMPT.replace("{{TODAY}}", today) + buildGlossaryBlock(glossary);
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

export async function generateAnswer(question: string, rows: unknown[]): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: `Question: ${question}\n\nQuery result (JSON array, may be empty): ${JSON.stringify(rows).slice(0, 8000)}` }],
      },
    ],
    config: {
      systemInstruction: ANSWER_SYSTEM_PROMPT,
      temperature: 0.3,
    },
  });
  return response.text?.trim() || "I couldn't turn that into an answer — try rephrasing the question.";
}
