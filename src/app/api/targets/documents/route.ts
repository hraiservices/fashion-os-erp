import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, notFound, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { mapTaskRow, targetsContext, taskVisible } from "@/lib/targets-server";
import { isHttpUrl, loadProjectFor } from "@/lib/targets-workspace";
import type { DocumentDto } from "@/lib/targets-types";

const schema = z.object({ projectId: uuid.nullable().default(null), taskId: uuid.nullable().default(null), name: text(120).min(1, "Give the document a name"), url: text(1000) });

/** GET ?projectId=<id> | ?taskId=<id> — document links for a project or a task. */
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
  return NextResponse.json({ documents: (data || []).map((d): DocumentDto => ({ id: d.id, projectId: d.project_id, taskId: d.task_id, name: d.name, url: d.url, createdBy: d.created_by, createdAt: d.created_at })) });
}

/** POST — attach a link (Drive, Dropbox, a photo link…) to a project or task. */
export async function POST(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const d = body.data;
  if (!d.projectId && !d.taskId) return badRequest("Say which project or task");
  if (!isHttpUrl(d.url)) return badRequest("Paste a web link starting with https://");

  let projectId = d.projectId;
  if (d.taskId) {
    const { data: t } = await db.from("work_tasks").select("*").eq("id", d.taskId).maybeSingle();
    if (!t || !taskVisible(mapTaskRow(t), ctx)) return notFound("Task not found");
    projectId = t.project_id;
  } else if (projectId && !(await loadProjectFor(db, ctx, projectId))) return notFound("Project not found");

  const { data, error } = await db.from("work_documents").insert({ project_id: projectId, task_id: d.taskId, name: d.name, url: d.url, created_by: ctx.email }).select("id").single();
  if (error || !data) return serverError(error?.message || "Couldn't save the link");
  return NextResponse.json({ ok: true, id: data.id });
}
