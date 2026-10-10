import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { forbidden, notFound, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";
import { canManageProject, loadProjectFor } from "@/lib/targets-workspace";

const schema = z.object({ projectId: uuid, name: text(80).min(1, "Give the task list a name") });

/** POST — add a task list ("Group By: Task List" section) to a project. Project owner or admin/manager. */
export async function POST(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const project = await loadProjectFor(db, ctx, body.data.projectId);
  if (!project) return notFound("Project not found");
  if (!canManageProject(ctx, project)) return forbidden("Only the project owner or a manager can add task lists");

  const { count } = await db.from("work_task_lists").select("id", { count: "exact", head: true }).eq("project_id", project.id);
  const { data, error } = await db.from("work_task_lists").insert({ project_id: project.id, name: body.data.name, sort_order: count ?? 0 }).select("id").single();
  if (error || !data) return serverError(error?.message || "Couldn't add the task list");
  return NextResponse.json({ ok: true, id: data.id });
}
