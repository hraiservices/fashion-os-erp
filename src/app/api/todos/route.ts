import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapTodoRow } from "@/lib/types";

/** The logged-in user's own to-do list — the desktop utility rail's To-do icon. Personal, per
 *  account, same service-role API pattern as /api/notes and /api/sheets. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data, error } = await db.from("user_todos").select("*").eq("user_email", user.email).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ todos: (data || []).map(mapTodoRow) });
}

const createSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data, error } = await db
    .from("user_todos")
    .insert({ user_email: user.email, text: parsed.data.text, done: false })
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not create to-do" }, { status: 500 });
  return NextResponse.json({ todo: mapTodoRow(data) });
}
