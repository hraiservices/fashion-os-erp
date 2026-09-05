import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { NOTE_COLORS, mapNoteRow } from "@/lib/types";

/** The logged-in user's own sticky notes — the desktop utility rail's Notes icon. Several
 *  notes per account, each independently colored, saved server-side so they follow the user
 *  across devices. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data, error } = await db.from("user_scratch_notes").select("*").eq("user_email", user.email).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: (data || []).map(mapNoteRow) });
}

const createSchema = z.object({
  content: z.string().max(5000).default(""),
  color: z.enum(NOTE_COLORS).default("yellow"),
});

export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data, error } = await db
    .from("user_scratch_notes")
    .insert({ user_email: user.email, content: parsed.data.content, color: parsed.data.color })
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not create note" }, { status: 500 });
  return NextResponse.json({ note: mapNoteRow(data) });
}
