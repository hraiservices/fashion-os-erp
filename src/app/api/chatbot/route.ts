import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateSql, generateAnswer, GeminiNotConfiguredError } from "@/lib/chatbot/gemini";
import { runChatbotQuery } from "@/lib/chatbot/db";
import { getChatbotGlossary } from "@/lib/settings";

const bodySchema = z.object({
  question: z.string().min(1).max(500),
});

const NO_DATA_ANSWER = "I couldn't find an answer to that. Try asking about revenue, orders, deliveries, or payments.";
// Distinct from NO_DATA_ANSWER on purpose: that one means the model itself judged the question
// out of scope (an empty "sql"). This one means the question WAS in scope — the model wrote a
// query — but something broke turning it into an answer (a transient Gemini hiccup, a bad
// generated query, a DB timeout). Collapsing both into the same wording was hiding real
// failures behind what looked like an unsupported-question message, on questions that plainly
// should have worked.
const TECHNICAL_ERROR_ANSWER = "Something went wrong answering that — please try again in a moment.";

type RefTable = "orders" | "invoices";

/**
 * Lets the UI turn a short result list into tappable links (e.g. "3 overdue orders" -> chips
 * that jump straight to those orders) without the model ever needing to know about app routes.
 * Only fires for a single-table query — a query that combines both views (a UNION, or "combine
 * both unless clearly about one" per the system prompt) can't be attributed row-by-row to a
 * source table, so it's left without links rather than guessed at.
 */
function detectRefTable(sql: string): RefTable | null {
  const hasOrders = /\bv_chatbot_orders\b/i.test(sql);
  const hasInvoices = /\bv_chatbot_invoices\b/i.test(sql);
  if (hasOrders && !hasInvoices) return "orders";
  if (hasInvoices && !hasOrders) return "invoices";
  return null;
}

function buildRefs(rows: Record<string, unknown>[], table: RefTable | null): { id: string; label: string }[] {
  if (!table || rows.length === 0 || rows.length > 5) return [];
  return rows
    .filter((r) => typeof r.id === "string" || typeof r.id === "number")
    .map((r) => ({
      id: String(r.id),
      label: table === "invoices" && typeof r.invoice_number === "string" ? r.invoice_number : String(r.id),
    }));
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

  let sql: string | null = null;
  let answer: string = TECHNICAL_ERROR_ANSWER;
  let followups: string[] = [];
  let errorMessage: string | null = null;
  let refs: { id: string; label: string }[] = [];
  let refTable: RefTable | null = null;
  let history: { question: string; answer: string }[] = [];

  try {
    const glossary = await getChatbotGlossary(supabase);

    // Pass recent conversation so the model can handle follow-up questions correctly.
    const { data: recentMessages } = await db
      .from("chatbot_messages")
      .select("question, answer")
      .eq("user_email", user.email)
      .order("created_at", { ascending: false })
      .limit(5);
    history = (recentMessages || []).reverse();

    sql = await generateSql(question, glossary, history);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "Unknown error";
    // A missing/invalid Gemini API key fails every single question identically — surfacing the
    // real reason here (rather than the generic "no answer" message) is the difference between
    // an admin fixing it in Settings in 30 seconds and it looking like the AI just doesn't work.
    answer = e instanceof GeminiNotConfiguredError ? e.message : TECHNICAL_ERROR_ANSWER;
  }

  if (!errorMessage) {
    if (!sql) {
      // The model itself decided this question can't be answered from the five views it has —
      // a real "not supported," not a bug.
      answer = NO_DATA_ANSWER;
    } else {
      try {
        const rows = await runChatbotQuery(sql);
        const generated = await generateAnswer(question, rows, history);
        answer = generated.answer;
        followups = generated.followups;
        refTable = detectRefTable(sql);
        refs = buildRefs(rows, refTable);
      } catch (e) {
        // The question WAS answerable — sql exists — so this is a genuine hiccup (a malformed
        // generated query, a DB timeout, a flaky Gemini call on the answer step), not a scope
        // limitation. Told apart from NO_DATA_ANSWER so it reads as "try again," not "unsupported."
        errorMessage = e instanceof Error ? e.message : "Unknown error";
        answer = TECHNICAL_ERROR_ANSWER;
      }
    }
  }

  // Persisted regardless of outcome — the SQL and any error are exactly what you'd need to
  // audit "why did it say that." RLS on this table is permissive like the rest of the schema;
  // the real per-user scoping happens here and in the GET route below.
  await db.from("chatbot_messages").insert({
    user_email: user.email,
    question,
    generated_sql: sql,
    answer,
    error: errorMessage,
  });

  return NextResponse.json({ answer, sql, refs, refTable, followups });
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
