import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapMiniSheetRow } from "@/lib/types";

/** The logged-in user's own mini spreadsheets — the desktop utility rail's Sheets icon. Several
 *  named sheets per account, saved server-side so they follow the user across devices, same
 *  pattern as /api/notes. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data, error } = await db.from("user_mini_sheets").select("*").eq("user_email", user.email).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sheets: (data || []).map(mapMiniSheetRow) });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60).default("Sheet"),
});

export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data, error } = await db
    .from("user_mini_sheets")
    .insert({ user_email: user.email, name: parsed.data.name, cells: {} })
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Could not create sheet" }, { status: 500 });
  return NextResponse.json({ sheet: mapMiniSheetRow(data) });
}
