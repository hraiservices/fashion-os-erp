import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, dateStr, forbidden, notFound, parseBody, serverError, text } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";
import { canManageProject, loadProjectFor } from "@/lib/targets-workspace";

type Ctx = { params: Promise<{ id: string }> };
const patchSchema = z.object({
  name: text(80).min(1).optional(),
  startDate: dateStr.nullable().optional(),
  endDate: dateStr.nullable().optional(),
  status: z.enum(["planned", "active", "done"]).optional(),
});

async function loadManageable(id: string) {
  const gate = await targetsContext();
  if ("error" in gate) return { error: gate.error };
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  const { data: phase } = await db.from("work_phases").select("*").eq("id", id).maybeSingle();
  if (!phase) return { error: notFound("Phase not found") };
  const project = await loadProjectFor(db, ctx, phase.project_id);
  if (!project) return { error: notFound("Phase not found") };
  if (!canManageProject(ctx, project)) return { error: forbidden("Only the project owner or a manager can change phases") };
  return { db, phase };
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const got = await loadManageable(id);
  if ("error" in got) return got.error;
  const body = await parseBody(request, patchSchema);
  if ("error" in body) return body.error;
  const d = body.data;
  const start = d.startDate !== undefined ? d.startDate : got.phase.start_date;
  const end = d.endDate !== undefined ? d.endDate : got.phase.end_date;
  if (start && end && end < start) return badRequest("The end date can't be before the start date");
  const { error } = await got.db
    .from("work_phases")
    .update({ ...(d.name !== undefined && { name: d.name }), start_date: start, end_date: end, ...(d.status !== undefined && { status: d.status }) })
    .eq("id", id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}

/** DELETE — the phase only; its tasks stay in the project. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const got = await loadManageable(id);
  if ("error" in got) return got.error;
  const { error } = await got.db.from("work_phases").delete().eq("id", id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
