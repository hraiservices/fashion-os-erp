import Anthropic from "@anthropic-ai/sdk";
import type { GlossaryEntry } from "@/lib/chatbot/glossary";
import { istDateString } from "@/lib/ist-date";
import { resolveAnthropicApiKey } from "@/lib/anthropic-config";
import { TOOL_DECLARATIONS, executeTool } from "@/lib/chatbot/tools";

/** Thrown when neither ANTHROPIC_API_KEY nor the Settings → AI Copilot key is configured —
 *  the chatbot route matches on this to give a specific "not configured" answer instead of the
 *  generic "couldn't find an answer" every other failure gets. */
export class ClaudeNotConfiguredError extends Error {
  constructor() {
    super("The AI Copilot isn't configured yet — ask your admin to add a Claude API key under Settings → AI Copilot.");
    this.name = "ClaudeNotConfiguredError";
  }
}

// Deliberately not cached across calls — an admin saving a new/corrected key in Settings must
// take effect on the very next question, not after a redeploy or server restart.
async function getClient(): Promise<Anthropic> {
  const apiKey = await resolveAnthropicApiKey();
  if (!apiKey) throw new ClaudeNotConfiguredError();
  return new Anthropic({ apiKey });
}

/**
 * A transient Claude API hiccup (a brief capacity-constrained 5xx, a rate limit, or a dropped
 * connection) previously failed the whole Copilot answer outright with no recovery — the exact
 * failure mode that was already found and fixed on the Gemini side of this same file's
 * predecessor (see gemini.ts's withGeminiRetry) after a real "AI Copilot never answers"
 * incident. One retry with a short backoff turns "every question has a chance of failing
 * outright" into "occasionally half a second slower."
 */
async function withClaudeRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const retryable = e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError;
    if (!retryable) throw e;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return fn();
  }
}

// Cheapest current Claude model — the Copilot is a high-volume, latency-sensitive Q&A route
// (per-tool-call lookups, not open-ended reasoning), exactly the workload this tier is for.
// Cost is real (unlike the free Gemini tier this replaces) but small: roughly a few thousand
// input tokens + a short answer per question, at $1/$5 per million input/output tokens.
const MODEL = "claude-haiku-4-5";
const MAX_TOOL_ROUNDS = 4;

const AGENT_SYSTEM_PROMPT = `You are a friendly, sharp business assistant for an Indian tailoring shop's ERP
(custom stitching orders + product sales). Money is in Indian Rupees (₹). Today's date is
{{TODAY}}.

You have tools that look up real, live data — orders, invoices, payments, expenses, inventory,
tailor workload. Given a business question (which may be in English, Hindi written in Roman
script, or a mix of both):

- Call whichever tool(s) answer it. Call more than one if the question needs it (e.g. "revenue
  and low stock" needs two tools). You may call tools across more than one turn if an answer
  needs a follow-up lookup.
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
Respond with JSON only, no other text: {"followups": ["<short question>", ...]}.`;

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

const ANTHROPIC_TOOLS: Anthropic.Tool[] = TOOL_DECLARATIONS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: { ...t.parameters, additionalProperties: false },
}));

export interface AgentTurnResult {
  answer: string;
  /** Every tool call made while answering, in order — persisted for audit/debugging (replacing
   *  the old generated_sql column) and used by the route to build result-chip links. */
  toolCalls: { name: string; args: Record<string, unknown>; result: unknown }[];
}

/**
 * Runs the full tool-calling agent turn for one question: Claude calls zero or more tools (each
 * a fixed query from tools.ts — see executeTool), sees their real results, and keeps going until
 * it has enough to answer directly with no more calls, or MAX_TOOL_ROUNDS is hit.
 */
export async function runAgentTurn(
  question: string,
  glossary: GlossaryEntry[] = [],
  history: { question: string; answer: string }[] = [],
): Promise<AgentTurnResult> {
  const client = await getClient();
  const today = istDateString();
  const system =
    AGENT_SYSTEM_PROMPT.replace("{{TODAY}}", today) +
    buildGlossaryBlock(glossary) +
    buildHistoryBlock(history);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const toolCalls: AgentTurnResult["toolCalls"] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await withClaudeRetry(() =>
      client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        tools: ANTHROPIC_TOOLS,
        messages,
      })
    );

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      const answer = textBlock?.text?.trim();
      if (!answer) throw new Error("Empty response from the model");
      return { answer, toolCalls };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const args = (block.input || {}) as Record<string, unknown>;
      let result: unknown;
      let isError = false;
      try {
        result = await executeTool(block.name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Tool failed" };
        isError = true;
      }
      toolCalls.push({ name: block.name, args, result });
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result), is_error: isError });
    }
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("The question needed too many lookups to answer — try breaking it into smaller questions");
}

/**
 * A short, cheap second call purely for follow-up suggestions — kept separate from the main
 * tool-calling turn, and fully self-contained in its own try/catch, so a failure here (or the
 * model preferring not to suggest any) can never threaten the actual answer the user is waiting
 * on. (A prior version of this pattern resolved the client outside its try/catch — a failure
 * there escaped uncaught and clobbered an already-good answer upstream; never repeat that.)
 */
export async function generateFollowups(question: string, answer: string): Promise<string[]> {
  try {
    const client = await getClient();
    const response = await withClaudeRetry(() =>
      client.messages.create({
        model: MODEL,
        max_tokens: 256,
        system: FOLLOWUPS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Question: ${question}\n\nAnswer given: ${answer}` }],
      })
    );
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock?.text) return [];
    const stripped = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(stripped) as { followups?: string[] };
    return (parsed.followups || []).slice(0, 3);
  } catch {
    return [];
  }
}
