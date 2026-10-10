import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, dateStr, forbidden, notFound, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { isActiveEmployee, logTaskEvent, mapTaskRow, targetsContext, taskVisible } from "@/lib/targets-server";
import { canAssignTo, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/work-tasks";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: text(200).min(1).optional(),
  description: text(2000).optional(),
  projectId: uuid.nullable().optional(),
  groupName: text(60).optional(),
  assigneeId: uuid.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  startDate: dateStr.nullable().optional(),
  dueDate: dateStr.nullable().optional(),
  checklist: z.array(z.object({ text: text(200), done: z.boolean() })).max(50).optional(),
  taskListId: uuid.nullable().optional(),
  phaseId: uuid.nullable().optional(),
  tags: z.array(text(30)).max(10).optional(),
  durationHours: z.number().min(0).max(10_000).nullable().optional(),
  completionPct: z.number().int().min(0).max(100).optional(),
  reminder: z.enum(["none", "on_due", "1_day", "2_days", "1_week"]).optional(),
  dependsOn: z.array(uuid).max(20).optional(),
});

async function loadVisible(db: SupabaseClient<Database>, id: string, ctx: Parameters<typeof taskVisible>[1]) {
  const { data } = await db.from("work_tasks").select("*").eq("id", id).maybeSingle();
  return data && taskVisible(mapTaskRow(data), ctx) ? data : null;
}

/** GET — one task with its subtasks. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const row = await loadVisible(db, id, ctx);
  if (!row) return notFound("Task not found");
  const { data: subs } = await db.from("work_tasks").select("*").eq("parent_task_id", id).order("created_at");
  return NextResponse.json({ task: mapTaskRow(row), subtasks: (subs || []).map(mapTaskRow) });
}

/** PATCH — edit a task, tick it off, reassign it. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, patchSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  const row = await loadVisible(db, id, ctx);
  if (!row) return notFound("Task not found");

  const update: Database["public"]["Tables"]["work_tasks"]["Update"] = { updated_at: new Date().toISOString() };
  if (d.title !== undefined) update.title = d.title;
  if (d.description !== undefined) update.description = d.description;
  if (d.groupName !== undefined) update.group_name = d.groupName;
  if (d.priority !== undefined) update.priority = d.priority;
  if (d.checklist !== undefined) update.checklist = d.checklist;
  if (d.startDate !== undefined) update.start_date = d.startDate;
  if (d.dueDate !== undefined) update.due_date = d.dueDate;
  if (d.taskListId !== undefined) update.task_list_id = d.taskListId;
  if (d.phaseId !== undefined) update.phase_id = d.phaseId;
  if (d.tags !== undefined) update.tags = d.tags;
  if (d.durationHours !== undefined) update.duration_hours = d.durationHours;
  if (d.completionPct !== undefined) update.completion_pct = d.completionPct;
  if (d.reminder !== undefined) update.reminder = d.reminder;
  if (d.dependsOn !== undefined) {
    if (d.dependsOn.includes(id)) return badRequest("A task can't depend on itself");
    update.depends_on = d.dependsOn;
  }
  const start = d.startDate !== undefined ? d.startDate : row.start_date;
  const due = d.dueDate !== undefined ? d.dueDate : row.due_date;
  if (start && due && due < start) return badRequest("The due date can't be before the start date");

  if (d.projectId !== undefined) {
    if (d.projectId) {
      const { data: project } = await db.from("work_projects").select("id").eq("id", d.projectId).maybeSingle();
      if (!project) return badRequest("The project wasn't found");
    }
    update.project_id = d.projectId;
  }
  if (d.assigneeId !== undefined && d.assigneeId !== row.assignee_id) {
    if (!canAssignTo(d.assigneeId, { employeeId: ctx.employeeId, canAssignOthers: ctx.perms.assignTasks })) return forbidden("You can't give tasks to other people");
    if (d.assigneeId && !(await isActiveEmployee(db, d.assigneeId))) return badRequest("That person isn't an active staff member");
    update.assignee_id = d.assigneeId;
  }
  if (d.status !== undefined && d.status !== row.status) {
    update.status = d.status;
    update.completed_at = d.status === "done" ? new Date().toISOString() : null;
  }

  const { error } = await db.from("work_tasks").update(update).eq("id", id);
  if (error) return serverError(error.message);
  if (update.status) await logTaskEvent(db, { taskId: id, projectId: row.project_id, kind: "status", body: `Status changed to ${update.status}`, email: ctx.email });
  if (update.assignee_id !== undefined) await logTaskEvent(db, { taskId: id, projectId: row.project_id, kind: "assigned", body: "Owner changed", email: ctx.email });
  return NextResponse.json({ ok: true });
}

/** DELETE — whoever created the task, or anyone who sees everything. Subtasks go with it. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const row = await loadVisible(db, id, ctx);
  if (!row) return notFound("Task not found");
  const mine = !!row.created_by && row.created_by.toLowerCase() === ctx.email.toLowerCase();
  if (!mine && !ctx.seesAll) return forbidden("Only the person who created a task can delete it");

  const { error } = await db.from("work_tasks").delete().eq("id", id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
