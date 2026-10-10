import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { notFound, parseBody, serverError, text } from "@/lib/targets-api";
import { mapTaskRow, targetsContext, taskVisible } from "@/lib/targets-server";
import type { TaskEventDto } from "@/lib/targets-types";

type Ctx = { params: Promise<{ id: string }> };

async function visibleTask(db: SupabaseClient<Database>, id: string, ctx: Parameters<typeof taskVisible>[1]) {
  const { data } = await db.from("work_tasks").select("*").eq("id", id).maybeSingle();
  return data && taskVisible(mapTaskRow(data), ctx) ? data : null;
}

/** GET — a task's comments and activity, newest first. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  if (!(await visibleTask(db, id, ctx))) return notFound("Task not found");

  const { data, error } = await db.from("work_task_events").select("*").eq("task_id", id).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ events: [] as TaskEventDto[] }); // workspace migration not run yet
  const events: TaskEventDto[] = (data || []).map((e) => ({ id: e.id, projectId: e.project_id, taskId: e.task_id, kind: e.kind, body: e.body, createdBy: e.created_by, createdAt: e.created_at }));
  return NextResponse.json({ events });
}

/** POST — add a comment. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, z.object({ body: text(2000).min(1, "Write a comment first") }));
  if ("error" in body) return body.error;
  const task = await visibleTask(db, id, ctx);
  if (!task) return notFound("Task not found");

  const { error } = await db.from("work_task_events").insert({ task_id: id, project_id: task.project_id, kind: "comment", body: body.data.body, created_by: ctx.email });
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
