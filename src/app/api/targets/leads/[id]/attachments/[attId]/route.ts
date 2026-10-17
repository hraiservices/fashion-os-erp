import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isUuid, notFound } from "@/lib/targets-api";
import { leadVisible, targetsContext } from "@/lib/targets-server";
import { LEAD_MEDIA_BUCKET } from "@/lib/lead-media";

/** DELETE — remove one attachment (the file and its record). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; attId: string }> }) {
  const { id, attId } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  if (!isUuid(id) || !isUuid(attId)) return notFound("Attachment not found");

  const { data: lead } = await db.from("leads").select("assigned_employee_id, created_by").eq("id", id).maybeSingle();
  if (!lead || !leadVisible(lead, ctx)) return notFound("Lead not found");
  const { data: att } = await db.from("lead_attachments").select("id, path").eq("id", attId).eq("lead_id", id).maybeSingle();
  if (!att) return notFound("Attachment not found");

  await db.from("lead_attachments").delete().eq("id", attId);
  // Best effort — the record is the source of truth for what is attached.
  await db.storage.from(LEAD_MEDIA_BUCKET).remove([att.path]).catch(() => {});
  return NextResponse.json({ ok: true });
}
