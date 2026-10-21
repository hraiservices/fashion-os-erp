import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, notFound, serverError, text, uuid } from "@/lib/targets-api";
import { mapTaskRow, targetsContext, taskVisible } from "@/lib/targets-server";
import { isHttpUrl, loadProjectFor } from "@/lib/targets-workspace";
import { safeObjectName } from "@/lib/lead-media";
import { TASK_DOCUMENT_BUCKET, TASK_DOCUMENT_MAX_BYTES } from "@/lib/task-media";
import type { DocumentDto } from "@/lib/targets-types";

const SIGNED_URL_SECONDS = 60 * 60;

const schema = z.discriminatedUnion("action", [
  // Back-compat shape (no action field at all, same as before uploads existed) also lands here via the default below.
  z.object({ action: z.literal("link"), projectId: uuid.nullable().default(null), taskId: uuid.nullable().default(null), name: text(120).min(1, "Give the document a name"), url: text(1000) }),
  z.object({ action: z.literal("upload-url"), projectId: uuid.nullable().default(null), taskId: uuid.nullable().default(null), name: text(200).min(1), contentType: text(120), size: z.number().int().min(1) }),
  z.object({ action: z.literal("register"), projectId: uuid.nullable().default(null), taskId: uuid.nullable().default(null), path: text(300).min(1), name: text(200).min(1), contentType: text(120), size: z.number().int().min(1) }),
]);

/** GET ?projectId=<id> | ?taskId=<id> — document links/files for a project or a task. */
export async function GET(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  const sp = new URL(request.url).searchParams;
  const projectId = sp.get("projectId");
  const taskId = sp.get("taskId");
  if (!projectId && !taskId) return badRequest("Say which project or task");

  if (projectId && !(await loadProjectFor(db, ctx, projectId))) return notFound("Project not found");
  if (taskId) {
    const { data: t } = await db.from("work_tasks").select("*").eq("id", taskId).maybeSingle();
    if (!t || !taskVisible(mapTaskRow(t), ctx)) return notFound("Task not found");
  }
  let q = db.from("work_documents").select("*").order("created_at", { ascending: false }).limit(200);
  q = taskId ? q.eq("task_id", taskId) : q.eq("project_id", projectId!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ documents: [] as DocumentDto[] });
  const rows = data || [];

  // An uploaded file's own `url` column is always empty — mint a short-lived signed link for it instead.
  const paths = rows.filter((r) => r.path).map((r) => r.path!);
  const signed = paths.length ? await db.storage.from(TASK_DOCUMENT_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS) : { data: [] };
  const urlByPath = new Map((signed.data || []).map((s) => [s.path ?? "", s.signedUrl]));

  const documents = rows.map((d): DocumentDto => ({
    id: d.id,
    projectId: d.project_id,
    taskId: d.task_id,
    name: d.name,
    url: (d.path ? urlByPath.get(d.path) : d.url) || "",
    createdBy: d.created_by,
    createdAt: d.created_at,
  }));
  return NextResponse.json({ documents });
}

/** POST — either add a link (Drive, Dropbox…), or the two-step upload: `upload-url` hands out a
 *  signed Storage target, then `register` (after the browser has uploaded) records the file. */
export async function POST(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object") return badRequest("Bad request");
  // Old callers (before uploads existed) send {projectId/taskId, name, url} with no action.
  const parsed = schema.safeParse("action" in raw ? raw : { ...raw, action: "link" });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return badRequest(first?.message || "Invalid request");
  }
  const d = parsed.data;
  if (!d.projectId && !d.taskId) return badRequest("Say which project or task");

  let projectId = d.projectId;
  if (d.taskId) {
    const { data: t } = await db.from("work_tasks").select("*").eq("id", d.taskId).maybeSingle();
    if (!t || !taskVisible(mapTaskRow(t), ctx)) return notFound("Task not found");
    projectId = t.project_id;
  } else if (projectId && !(await loadProjectFor(db, ctx, projectId))) return notFound("Project not found");

  if (d.action === "link") {
    if (!isHttpUrl(d.url)) return badRequest("Paste a web link starting with https://");
    const { data, error } = await db.from("work_documents").insert({ project_id: projectId, task_id: d.taskId, name: d.name, url: d.url, created_by: ctx.email }).select("id").single();
    if (error || !data) return serverError(error?.message || "Couldn't save the link");
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (d.size > TASK_DOCUMENT_MAX_BYTES) return badRequest("That file is over 25 MB");
  const folder = d.taskId ? `task/${d.taskId}` : `project/${projectId}`;

  if (d.action === "upload-url") {
    const path = `${folder}/${safeObjectName(d.name)}`;
    const { data, error } = await db.storage.from(TASK_DOCUMENT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return serverError("Couldn't start the upload — has the task-documents storage been set up?");
    return NextResponse.json({ path, token: data.token });
  }

  // register
  if (!d.path.startsWith(`${folder}/`) || d.path.includes("..")) return badRequest("That file doesn't belong here");
  const { error: missing } = await db.storage.from(TASK_DOCUMENT_BUCKET).createSignedUrl(d.path, 60);
  if (missing) return badRequest("The upload didn't finish — please try again");

  const { data: row, error } = await db
    .from("work_documents")
    .insert({ project_id: projectId, task_id: d.taskId, name: d.name, path: d.path, content_type: d.contentType, size_bytes: d.size, created_by: ctx.email })
    .select("id")
    .single();
  if (error || !row) return serverError(error?.message || "Couldn't save the document");
  return NextResponse.json({ ok: true, id: row.id });
}
