import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { istDateString } from "@/lib/ist-date";
import { badRequest, dateStr, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { isActiveEmployee, targetsContext } from "@/lib/targets-server";
import { mapProjectRow, type ProjectWithProgress } from "@/lib/targets-types";
import { isOverdue, PROJECT_STATUSES, projectProgress } from "@/lib/work-tasks";
import { logAction } from "@/lib/logging";

const createSchema = z
  .object({
    name: text(120).min(1, "Give the project a name"),
    description: text(1000).default(""),
    ownerId: uuid.nullable().optional(),
    startDate: dateStr.nullable().default(null),
    endDate: dateStr.nullable().default(null),
    status: z.enum(PROJECT_STATUSES).default("active"),
    targetId: uuid.nullable().default(null),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { message: "The end date can't be before the start date", path: ["endDate"] });

/** GET — projects this person can see (everyone's if they see all; otherwise ones they own, created or have tasks in). */
export async function GET() {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const [{ data: projects, error }, { data: tasks }] = await Promise.all([
    db.from("work_projects").select("*").order("created_at", { ascending: false }),
    db.from("work_tasks").select("project_id, status, due_date, assignee_id").not("project_id", "is", null).limit(5000),
  ]);
  if (error) return serverError(error.message);

  const today = istDateString();
  const myProjects = new Set((tasks || []).filter((t) => ctx.employeeId && t.assignee_id === ctx.employeeId).map((t) => t.project_id));
  const out: ProjectWithProgress[] = [];
  for (const p of projects || []) {
    const mine = ctx.seesAll || (!!ctx.employeeId && p.owner_id === ctx.employeeId) || (!!p.created_by && p.created_by.toLowerCase() === ctx.email.toLowerCase()) || myProjects.has(p.id);
    if (!mine) continue;
    const pt = (tasks || []).filter((t) => t.project_id === p.id);
    out.push({
      ...mapProjectRow(p),
      progress: projectProgress(pt),
      overdueTasks: pt.filter((t) => isOverdue({ status: t.status, dueDate: t.due_date }, today)).length,
    });
  }
  return NextResponse.json({ projects: out });
}

/** POST — create a project (admin/manager: manageTargets). */
export async function POST(request: Request) {
  const gate = await targetsContext("manageTargets");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, createSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  const owner = d.ownerId === undefined ? ctx.employeeId : d.ownerId;
  if (owner && !(await isActiveEmployee(db, owner))) return badRequest("That person isn't an active staff member");
  if (d.targetId) {
    const { data: t } = await db.from("sales_targets").select("id").eq("id", d.targetId).maybeSingle();
    if (!t) return badRequest("The linked target wasn't found");
  }

  const { data, error } = await db
    .from("work_projects")
    .insert({ name: d.name, description: d.description, owner_id: owner ?? null, start_date: d.startDate, end_date: d.endDate, status: d.status, target_id: d.targetId, created_by: ctx.email })
    .select("id")
    .single();
  if (error || !data) return serverError(error?.message || "Couldn't create the project");

  await logAction(db, ctx.email, `📁 Project created: ${d.name}`, null, null);
  return NextResponse.json({ ok: true, id: data.id });
}
