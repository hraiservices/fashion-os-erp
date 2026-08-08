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

  try {
    const glossary = await getChatbotGlossary(supabase);
    sql = await generateSql(question, glossary);
    if (!sql) {
      answer = NO_DATA_ANSWER;
    } else {
      const rows = await runChatbotQuery(sql);
      answer = await generateAnswer(question, rows);
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

  return NextResponse.json({ answer, sql });
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
