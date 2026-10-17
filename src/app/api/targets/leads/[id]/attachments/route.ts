import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, isUuid, notFound, parseBody, serverError, text } from "@/lib/targets-api";
import { leadVisible, targetsContext } from "@/lib/targets-server";
import { LEAD_MEDIA_BUCKET, LEAD_MEDIA_MAX_BYTES, leadMediaKind, safeObjectName } from "@/lib/lead-media";
import type { LeadAttachmentDto } from "@/lib/targets-types";

type Ctx = { params: Promise<{ id: string }> };

const SIGNED_URL_SECONDS = 60 * 60;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upload-url"), name: text(200).min(1), contentType: text(120).min(1), size: z.number().int().min(1) }),
  z.object({ action: z.literal("register"), path: text(300).min(1), name: text(200).min(1), contentType: text(120).min(1), size: z.number().int().min(1) }),
]);

async function visibleLead(db: SupabaseClient<Database>, id: string, ctx: Parameters<typeof leadVisible>[1]) {
  if (!isUuid(id)) return false;
  const { data: row } = await db.from("leads").select("assigned_employee_id, created_by").eq("id", id).maybeSingle();
  return !!row && leadVisible(row, ctx);
}

/** GET — the lead's attachments, newest first, each with a short-lived signed link. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  if (!(await visibleLead(db, id, ctx))) return notFound("Lead not found");

  const { data, error } = await db.from("lead_attachments").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(300);
  // A shop that hasn't run the migration yet just sees no attachments rather than a broken lead page.
  if (error) return NextResponse.json({ attachments: [] as LeadAttachmentDto[] });
  const rows = data || [];
  const signed = rows.length ? await db.storage.from(LEAD_MEDIA_BUCKET).createSignedUrls(rows.map((r) => r.path), SIGNED_URL_SECONDS) : { data: [] };
  const urlByPath = new Map((signed.data || []).map((s) => [s.path ?? "", s.signedUrl]));
  const attachments = rows.map((r): LeadAttachmentDto => ({
    id: r.id,
    leadId: r.lead_id,
    kind: (["image", "audio", "video", "file"].includes(r.kind) ? r.kind : "file") as LeadAttachmentDto["kind"],
    name: r.name,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes) || 0,
    url: urlByPath.get(r.path) || null,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
  return NextResponse.json({ attachments });
}

/**
 * POST — two steps, so big photos and voice notes never pass through the serverless body limit:
 *   { action: "upload-url" } checks the file and returns a one-time signed upload target;
 *   { action: "register" } (after the browser has uploaded) records it against the lead.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, bodySchema);
  if ("error" in body) return body.error;
  const d = body.data;
  if (!(await visibleLead(db, id, ctx))) return notFound("Lead not found");

  const kind = leadMediaKind(d.contentType);
  if (!kind) return badRequest("That kind of file isn't supported — send a photo, voice note, video, PDF or document");
  if (d.size > LEAD_MEDIA_MAX_BYTES) return badRequest("That file is over 25 MB");

  if (d.action === "upload-url") {
    const path = `${id}/${safeObjectName(d.name)}`;
    const { data, error } = await db.storage.from(LEAD_MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return serverError("Couldn't start the upload — has the lead-media storage been set up?");
    return NextResponse.json({ path, token: data.token });
  }

  // The path must be inside this lead's own folder, and the file must really be there.
  if (!d.path.startsWith(`${id}/`) || d.path.includes("..")) return badRequest("That file doesn't belong to this lead");
  const { error: missing } = await db.storage.from(LEAD_MEDIA_BUCKET).createSignedUrl(d.path, 60);
  if (missing) return badRequest("The upload didn't finish — please try again");

  const { data: row, error } = await db
    .from("lead_attachments")
    .insert({ lead_id: id, kind, name: d.name, path: d.path, content_type: d.contentType, size_bytes: d.size, created_by: ctx.email })
    .select("id")
    .single();
  if (error || !row) return serverError("Couldn't save the attachment");
  await db.from("leads").update({ updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, id: row.id });
}
