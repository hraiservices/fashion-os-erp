import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { dateStr, forbidden, notFound, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";
import { canManageProject, loadProjectFor } from "@/lib/targets-workspace";

const schema = z
  .object({
    projectId: uuid,
    name: text(80).min(1, "Give the phase a name"),
    startDate: dateStr.nullable().default(null),
    endDate: dateStr.nullable().default(null),
    status: z.enum(["planned", "active", "done"]).default("planned"),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { message: "The end date can't be before the start date", path: ["endDate"] });

/** POST — add a phase (milestone) to a project. Project owner or admin/manager. */
export async function POST(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const d = body.data;
  const project = await loadProjectFor(db, ctx, d.projectId);
  if (!project) return notFound("Project not found");
  if (!canManageProject(ctx, project)) return forbidden("Only the project owner or a manager can add phases");

  const { count } = await db.from("work_phases").select("id", { count: "exact", head: true }).eq("project_id", project.id);
  const { data, error } = await db
    .from("work_phases")
    .insert({ project_id: project.id, name: d.name, start_date: d.startDate, end_date: d.endDate, status: d.status, sort_order: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) return serverError(error?.message || "Couldn't add the phase");
  return NextResponse.json({ ok: true, id: data.id });
}
