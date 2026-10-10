import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { notFound, parseBody, text } from "@/lib/targets-api";
import { addLeadActivity, leadVisible, targetsContext } from "@/lib/targets-server";

const schema = z.object({
  kind: z.enum(["note", "call", "meeting"]),
  body: text(1000).min(1, "Write something first"),
});

/** POST — add a note, call or meeting to a lead's timeline. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;

  const { data: row } = await db.from("leads").select("assigned_employee_id, created_by").eq("id", id).maybeSingle();
  if (!row || !leadVisible(row, ctx)) return notFound("Lead not found");

  await addLeadActivity(db, id, body.data.kind, body.data.body, ctx.email);
  await db.from("leads").update({ updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}
