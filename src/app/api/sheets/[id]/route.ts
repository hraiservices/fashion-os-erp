import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapMiniSheetRow } from "@/lib/types";

const cellDataSchema = z.object({
  value: z.string().max(2000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: z.string().max(20).optional(),
  bg: z.string().max(20).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  // A cell is either a legacy plain string (unformatted) or a structured {value,...} object once
  // formatting has been applied — see lib/mini-sheet.ts's normalizeCell.
  cells: z.record(z.string(), z.union([z.string().max(2000), cellDataSchema])).optional(),
});

/** PATCH/DELETE always scoped to `user_email = current user` — never trusts the id alone, so
 *  one account can never edit or delete another's sheet by guessing its id. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  if (parsed.data.name === undefined && parsed.data.cells === undefined) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await db
    .from("user_mini_sheets")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_email", user.email)
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Sheet not found" }, { status: 404 });
  return NextResponse.json({ sheet: mapMiniSheetRow(data) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { error } = await db.from("user_mini_sheets").delete().eq("id", id).eq("user_email", user.email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
