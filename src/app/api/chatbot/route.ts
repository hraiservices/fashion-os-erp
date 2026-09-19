import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { runAgentTurn, generateFollowups, ClaudeNotConfiguredError } from "@/lib/chatbot/claude";
import { tryFallbackAnswer } from "@/lib/chatbot/fallback";
import { getChatbotGlossary } from "@/lib/settings";

const bodySchema = z.object({
  question: z.string().min(1).max(500),
});

const TECHNICAL_ERROR_ANSWER = "Something went wrong answering that — please try again in a moment.";

type RefTable = "orders" | "invoices";

const ORDER_TOOLS = new Set(["get_pending_orders", "get_aging_report", "get_ready_uncollected", "get_delivered_unpaid", "search_customer_orders"]);
const INVOICE_TOOLS = new Set(["get_invoice_status_summary"]);

/**
 * Lets the UI turn a short result list into tappable links (e.g. "3 overdue orders" -> chips
 * that jump straight to those orders) without the model ever needing to know about app routes.
 * Only fires when exactly one tool call in the turn returned order/invoice rows — a turn that
 * mixes tool types, or returns aggregate (non-row) data, is left without links rather than
 * guessed at.
 */
function buildRefs(toolCalls: { name: string; result: unknown }[]): { refs: { id: string; label: string }[]; refTable: RefTable | null } {
  const rowCalls = toolCalls.filter((c) => Array.isArray(c.result) && (ORDER_TOOLS.has(c.name) || INVOICE_TOOLS.has(c.name)));
  if (rowCalls.length !== 1) return { refs: [], refTable: null };
  const call = rowCalls[0];
  const refTable: RefTable = INVOICE_TOOLS.has(call.name) ? "invoices" : "orders";
  const rows = call.result as Record<string, unknown>[];
  if (rows.length === 0 || rows.length > 5) return { refs: [], refTable };
  const refs = rows
    .filter((r) => typeof r.id === "string" || typeof r.id === "number")
    .map((r) => ({
      id: String(r.id),
      label: refTable === "invoices" && typeof r.invoice_number === "string" ? r.invoice_number : String(r.id),
    }));
  return { refs, refTable };
}

export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.useChatbot) return NextResponse.json({ error: "No permission to use the AI Copilot" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { question } = parsed.data;

  let answer: string = TECHNICAL_ERROR_ANSWER;
  let followups: string[] = [];
  let errorMessage: string | null = null;
  let refs: { id: string; label: string }[] = [];
  let refTable: RefTable | null = null;
  let toolsUsed: string[] = [];
  let toolCalls: { name: string; result: unknown }[] = [];

  try {
    const glossary = await getChatbotGlossary(supabase);

    // Pass recent conversation so the model can handle follow-up questions correctly.
    const { data: recentMessages } = await db
      .from("chatbot_messages")
      .select("question, answer")
      .eq("user_email", user.email)
      .order("created_at", { ascending: false })
      .limit(5);
    const history = (recentMessages || []).reverse();

    const result = await runAgentTurn(question, glossary, history);
    // From here on, `answer` and `toolsUsed` are a done deal — a real answer was produced.
    // Follow-up suggestions and ref-chip links are best-effort polish on top of it; a failure
    // in either must never overwrite the answer the user is actually waiting on (this exact
    // failure mode — a followups hiccup silently clobbering a good answer — is why refs/
    // followups get their own try below instead of sharing this one).
    answer = result.answer;
    toolsUsed = result.toolCalls.map((c) => c.name);
    toolCalls = result.toolCalls;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "Unknown error";
    // Claude itself is unreachable/not configured/rate-limited — this only fires when the AI
    // call failed, never when Claude ran fine but genuinely couldn't answer (that path never
    // reaches this catch). Before giving up, try the same real data behind the Reports pages
    // with a plain keyword match — no AI involved — so common questions still get a real
    // answer instead of a flat error. `errorMessage` stays set either way so the underlying
    // failure is still visible in the persisted history for an admin to notice and fix.
    const fallback = await tryFallbackAnswer(question);
    if (fallback) {
      answer = fallback;
    } else {
      // A missing/invalid Claude API key fails every single question identically — surfacing
      // the real reason here (rather than the generic "no answer" message) is the difference
      // between an admin fixing it in Settings in 30 seconds and it looking like the AI just
      // doesn't work.
      answer = e instanceof ClaudeNotConfiguredError ? e.message : TECHNICAL_ERROR_ANSWER;
    }
  }

  if (!errorMessage) {
    try {
      ({ refs, refTable } = buildRefs(toolCalls));
      followups = await generateFollowups(question, answer);
    } catch {
      // Best-effort polish only — an empty refs/followups list is a fine degraded result,
      // nowhere near serious enough to turn a good answer into an error.
    }
  }

  // Persisted regardless of outcome — the tools called and any error are exactly what you'd
  // need to audit "why did it say that," replacing the old generated_sql column. RLS on this
  // table is permissive like the rest of the schema; the real per-user scoping happens here
  // and in the GET route below.
  await db.from("chatbot_messages").insert({
    user_email: user.email,
    question,
    generated_sql: toolsUsed.length ? toolsUsed.join(", ") : null,
    answer,
    error: errorMessage,
  });

  return NextResponse.json({ answer, sql: toolsUsed.join(", ") || null, refs, refTable, followups });
}

export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.useChatbot) return NextResponse.json({ error: "No permission to use the AI Copilot" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data, error } = await db
    .from("chatbot_messages")
    .select("*")
    .eq("user_email", user.email)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
}

/** Clears this user's own conversation — lets them start fresh instead of every new topic
 *  dragging in unrelated "recent conversation" context from a much older question. */
export async function DELETE() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.useChatbot) return NextResponse.json({ error: "No permission to use the AI Copilot" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { error } = await db.from("chatbot_messages").delete().eq("user_email", user.email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cleared: true });
}
