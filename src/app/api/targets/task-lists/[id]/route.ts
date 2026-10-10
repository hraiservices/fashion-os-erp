import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { forbidden, notFound, parseBody, serverError, text } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";
import { canManageProject, loadProjectFor } from "@/lib/targets-workspace";

type Ctx = { params: Promise<{ id: string }> };
const patchSchema = z.object({ name: text(80).min(1).optional(), sortOrder: z.number().int().min(0).max(1000).optional() });

async function loadManageable(id: string) {
  const gate = await targetsContext();
  if ("error" in gate) return { error: gate.error };
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  const { data: list } = await db.from("work_task_lists").select("*").eq("id", id).maybeSingle();
  if (!list) return { error: notFound("Task list not found") };
  const project = await loadProjectFor(db, ctx, list.project_id);
  if (!project) return { error: notFound("Task list not found") };
  if (!canManageProject(ctx, project)) return { error: forbidden("Only the project owner or a manager can change task lists") };
  return { db };
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const got = await loadManageable(id);
  if ("error" in got) return got.error;
  const body = await parseBody(request, patchSchema);
  if ("error" in body) return body.error;
  const { error } = await got.db
    .from("work_task_lists")
    .update({ ...(body.data.name !== undefined && { name: body.data.name }), ...(body.data.sortOrder !== undefined && { sort_order: body.data.sortOrder }) })
    .eq("id", id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}

/** DELETE — the list only; its tasks stay in the project, just ungrouped. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const got = await loadManageable(id);
  if ("error" in got) return got.error;
  const { error } = await got.db.from("work_task_lists").delete().eq("id", id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
