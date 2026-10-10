import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, dateStr, forbidden, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { isActiveEmployee, leadVisible, logTaskEvent, mapTaskRow, targetsContext, taskVisible } from "@/lib/targets-server";
import { canAssignTo, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/work-tasks";
import { logAction } from "@/lib/logging";

const taskFields = {
  title: text(200).min(1, "Give the task a name"),
  description: text(2000).default(""),
  projectId: uuid.nullable().default(null),
  parentTaskId: uuid.nullable().default(null),
  groupName: text(60).default(""),
  assigneeId: uuid.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  status: z.enum(TASK_STATUSES).default("todo"),
  startDate: dateStr.nullable().default(null),
  dueDate: dateStr.nullable().default(null),
  checklist: z.array(z.object({ text: text(200), done: z.boolean() })).max(50).default([]),
  linkType: z.enum(["lead", "target", "customer", "order", "invoice"]).nullable().default(null),
  linkId: text(80).nullable().default(null),
  taskListId: uuid.nullable().optional(),
  phaseId: uuid.nullable().optional(),
  tags: z.array(text(30)).max(10).optional(),
  durationHours: z.number().min(0).max(10_000).nullable().optional(),
  completionPct: z.number().int().min(0).max(100).optional(),
  reminder: z.enum(["none", "on_due", "1_day", "2_days", "1_week"]).optional(),
  dependsOn: z.array(uuid).max(20).optional(),
};
const createSchema = z.object(taskFields);

/** GET — tasks this person may see. ?assignee=me|<id>|all  ?status=open|done|all  ?project=<id>  ?link=lead:<id>  ?group=text */
export async function GET(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status") || "open";
  const assignee = sp.get("assignee");
  let q = db.from("work_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }).limit(1500);
  if (status === "open") q = q.not("status", "in", "(done,cancelled)");
  else if (status === "done") q = q.in("status", ["done", "cancelled"]).order("completed_at", { ascending: false }).limit(300);
  if (sp.get("project")) q = q.eq("project_id", sp.get("project")!);
  if (sp.get("group")) q = q.eq("group_name", sp.get("group")!);
  const link = sp.get("link");
  if (link?.includes(":")) {
    const [type, id] = link.split(":");
    q = q.eq("link_type", type).eq("link_id", id);
  }
  const { data, error } = await q;
  if (error) return serverError(error.message);

  let tasks = (data || []).map(mapTaskRow).filter((t) => taskVisible(t, ctx));
  if (assignee === "me") tasks = tasks.filter((t) => t.assigneeId === ctx.employeeId);
  else if (assignee && assignee !== "all") tasks = tasks.filter((t) => t.assigneeId === assignee);

  // Label the lead each follow-up belongs to, so a task row can say "Call Sneha — Lehenga enquiry".
  const leadIds = Array.from(new Set(tasks.filter((t) => t.linkType === "lead" && t.linkId).map((t) => t.linkId as string)));
  if (leadIds.length) {
    const { data: leads } = await db.from("leads").select("id, name").in("id", leadIds);
    const names = new Map((leads || []).map((l) => [l.id, l.name]));
    for (const t of tasks) if (t.linkType === "lead" && t.linkId) t.linkLabel = names.get(t.linkId) ?? null;
  }
  return NextResponse.json({ tasks });
}

/** POST — create a task. Anyone can create tasks for themselves; assigning to others needs assignTasks. */
export async function POST(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, createSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  // Default: the task is for whoever created it.
  const assigneeId = d.assigneeId === undefined ? ctx.employeeId : d.assigneeId;
  if (!canAssignTo(assigneeId, { employeeId: ctx.employeeId, canAssignOthers: ctx.perms.assignTasks })) return forbidden("You can only create tasks for yourself");
  if (assigneeId && !(await isActiveEmployee(db, assigneeId))) return badRequest("That person isn't an active staff member");

  if (d.parentTaskId) {
    const { data: parent } = await db.from("work_tasks").select("*").eq("id", d.parentTaskId).maybeSingle();
    if (!parent || !taskVisible(mapTaskRow(parent), ctx)) return badRequest("The parent task wasn't found");
    if (parent.parent_task_id) return badRequest("A subtask can't have its own subtasks");
  }
  if (d.projectId) {
    const { data: project } = await db.from("work_projects").select("id").eq("id", d.projectId).maybeSingle();
    if (!project) return badRequest("The project wasn't found");
  }
  if (d.linkType === "lead" && d.linkId) {
    const { data: lead } = await db.from("leads").select("assigned_employee_id, created_by").eq("id", d.linkId).maybeSingle();
    if (!lead || !leadVisible(lead, ctx)) return badRequest("The lead wasn't found");
  }
  if (d.dueDate && d.startDate && d.dueDate < d.startDate) return badRequest("The due date can't be before the start date");

  const { data, error } = await db
    .from("work_tasks")
    .insert({
      title: d.title,
      description: d.description,
      project_id: d.projectId,
      parent_task_id: d.parentTaskId,
      group_name: d.groupName,
      assignee_id: assigneeId ?? null,
      priority: d.priority,
      status: d.status,
      start_date: d.startDate,
      due_date: d.dueDate,
      completed_at: d.status === "done" ? new Date().toISOString() : null,
      checklist: d.checklist,
      link_type: d.linkId ? d.linkType : null,
      link_id: d.linkType ? d.linkId : null,
      created_by: ctx.email,
      // Workspace columns — only sent when used, so plain tasks still save before the workspace migration is run.
      ...(d.taskListId ? { task_list_id: d.taskListId } : {}),
      ...(d.phaseId ? { phase_id: d.phaseId } : {}),
      ...(d.tags?.length ? { tags: d.tags } : {}),
      ...(d.durationHours != null ? { duration_hours: d.durationHours } : {}),
      ...(d.completionPct ? { completion_pct: d.completionPct } : {}),
      ...(d.reminder && d.reminder !== "none" ? { reminder: d.reminder } : {}),
      ...(d.dependsOn?.length ? { depends_on: d.dependsOn } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return serverError(error?.message || "Couldn't create the task");
  await logTaskEvent(db, { taskId: data.id, projectId: d.projectId, kind: "created", body: `Task created: ${d.title}`, email: ctx.email });

  if (assigneeId && assigneeId !== ctx.employeeId) await logAction(db, ctx.email, `📌 Task assigned: ${d.title}`, null, d.dueDate ? `due ${d.dueDate}` : null);
  return NextResponse.json({ ok: true, id: data.id });
}
