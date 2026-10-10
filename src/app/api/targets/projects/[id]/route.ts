import { NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { istDateString } from "@/lib/ist-date";
import { badRequest, dateStr, notFound, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { isActiveEmployee, mapTaskRow, targetsContext, taskVisible } from "@/lib/targets-server";
import { mapProjectRow } from "@/lib/targets-types";
import { canManageProject, loadProjectFor } from "@/lib/targets-workspace";
import { isOverdue, PROJECT_STATUSES, projectProgress } from "@/lib/work-tasks";
import { logAction } from "@/lib/logging";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: text(120).min(1).optional(),
  description: text(1000).optional(),
  ownerId: uuid.nullable().optional(),
  startDate: dateStr.nullable().optional(),
  endDate: dateStr.nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  targetId: uuid.nullable().optional(),
});

/** GET — one project, its progress, and the tasks this person may see. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const project = await loadProjectFor(db, ctx, id);
  if (!project) return notFound("Project not found");
  // Lists, phases and members come from the workspace migration; before it is run they are simply empty.
  const [{ data: tasks }, { data: lists }, { data: phases }, { data: members }] = await Promise.all([
    db.from("work_tasks").select("*").eq("project_id", id).order("due_date", { ascending: true, nullsFirst: false }),
    db.from("work_task_lists").select("*").eq("project_id", id).order("sort_order"),
    db.from("work_phases").select("*").eq("project_id", id).order("sort_order"),
    db.from("work_project_members").select("employee_id").eq("project_id", id),
  ]);

  const all = (tasks || []).map(mapTaskRow);

  const today = istDateString();
  return NextResponse.json({
    project: { ...mapProjectRow(project), progress: projectProgress(all), overdueTasks: all.filter((t) => isOverdue(t, today)).length },
    tasks: all.filter((t) => taskVisible(t, ctx)),
    lists: (lists || []).map((l) => ({ id: l.id, projectId: l.project_id, name: l.name, sortOrder: l.sort_order })),
    phases: (phases || []).map((p) => ({ id: p.id, projectId: p.project_id, name: p.name, startDate: p.start_date, endDate: p.end_date, status: p.status, sortOrder: p.sort_order })),
    memberIds: (members || []).map((m) => m.employee_id),
    canManage: canManageProject(ctx, project),
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageTargets");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, patchSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  const { data: existing } = await db.from("work_projects").select("*").eq("id", id).maybeSingle();
  if (!existing) return notFound("Project not found");

  const start = d.startDate !== undefined ? d.startDate : existing.start_date;
  const end = d.endDate !== undefined ? d.endDate : existing.end_date;
  if (start && end && end < start) return badRequest("The end date can't be before the start date");
  if (d.ownerId && !(await isActiveEmployee(db, d.ownerId))) return badRequest("That person isn't an active staff member");

  const { error } = await db
    .from("work_projects")
    .update({
      ...(d.name !== undefined && { name: d.name }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.ownerId !== undefined && { owner_id: d.ownerId }),
      start_date: start,
      end_date: end,
      ...(d.status !== undefined && { status: d.status }),
      ...(d.targetId !== undefined && { target_id: d.targetId }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return serverError(error.message);
  after(() => logAction(db, ctx.email, `📁 Project updated: ${d.name ?? existing.name}`, null, d.status ? `status → ${d.status}` : null));
  return NextResponse.json({ ok: true });
}

/** DELETE — the project only; its tasks stay (they just lose the project). */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageTargets");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const { data: existing } = await db.from("work_projects").select("name").eq("id", id).maybeSingle();
  if (!existing) return notFound("Project not found");
  const { error } = await db.from("work_projects").delete().eq("id", id);
  if (error) return serverError(error.message);
  after(() => logAction(db, ctx.email, `🗑️ Project deleted: ${existing.name}`, null, null));
  return NextResponse.json({ ok: true });
}
