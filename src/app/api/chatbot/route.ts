import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { generateSql, generateAnswer } from "@/lib/chatbot/gemini";
import { runChatbotQuery } from "@/lib/chatbot/db";
import { getChatbotGlossary } from "@/lib/settings";

const bodySchema = z.object({
  question: z.string().min(1).max(500),
});

const NO_DATA_ANSWER = "I couldn't find an answer to that. Try asking about revenue, orders, deliveries, or payments.";

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

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { question } = parsed.data;

  let sql: string | null = null;
  let answer: string;
  let errorMessage: string | null = null;
  let refs: { id: string; label: string }[] = [];
  let refTable: RefTable | null = null;

  try {
    const glossary = await getChatbotGlossary(supabase);

    // Pass recent conversation so the model can handle follow-up questions correctly.
    const { data: recentMessages } = await supabase
      .from("chatbot_messages")
      .select("question, answer")
      .eq("user_email", user.email)
      .order("created_at", { ascending: false })
      .limit(5);
    const history = (recentMessages || []).reverse();

    sql = await generateSql(question, glossary, history);
    if (!sql) {
      answer = NO_DATA_ANSWER;
    } else {
      const rows = await runChatbotQuery(sql);
      answer = await generateAnswer(question, rows, history);
      refTable = detectRefTable(sql);
      refs = buildRefs(rows, refTable);
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "Unknown error";
    answer = NO_DATA_ANSWER;
  }

  // Persisted regardless of outcome — the SQL and any error are exactly what you'd need to
  // audit "why did it say that." RLS on this table is permissive like the rest of the schema;
  // the real per-user scoping happens here and in the GET route below.
  await supabase.from("chatbot_messages").insert({
    user_email: user.email,
    question,
    generated_sql: sql,
    answer,
    error: errorMessage,
  });

  return NextResponse.json({ answer, sql, refs, refTable });
}

export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.useChatbot) return NextResponse.json({ error: "No permission to use the AI Copilot" }, { status: 403 });

  const { data, error } = await supabase
    .from("chatbot_messages")
    .select("*")
    .eq("user_email", user.email)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
}
