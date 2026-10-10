import { NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, dateStr, forbidden, isUuid, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { fetchAll, inBatches, isActiveEmployee, leadVisible, logTaskEvent, mapTaskRow, ownershipFilter, targetsContext, taskVisible } from "@/lib/targets-server";
import { checkDependencies, checkTaskWorkspaceRefs, loadProjectFor } from "@/lib/targets-workspace";
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
  const project = sp.get("project");
  const group = sp.get("group");
  const link = sp.get("link");
  if (project && !isUuid(project)) return badRequest("That project id isn't valid");
  if (assignee && assignee !== "me" && assignee !== "all" && !isUuid(assignee)) return badRequest("That person id isn't valid");

  // Everything the caller asked for, newest due date first. Open and "all" lists are read in pages (a single
  // query stops at 1000 rows); finished tasks are capped at the latest 300 on purpose.
  const mine = ownershipFilter(ctx, "assignee_id");
  const build = () => {
    let q = db.from("work_tasks").select("*");
    if (mine) q = q.or(mine);
    if (status === "open") q = q.not("status", "in", "(done,cancelled)");
    else if (status === "done") q = q.in("status", ["done", "cancelled"]);
    if (project) q = q.eq("project_id", project);
    if (group) q = q.eq("group_name", group);
    if (link?.includes(":")) {
      const [type, id] = link.split(":");
      q = q.eq("link_type", type).eq("link_id", id);
    }
    return q;
  };
  let data: Database["public"]["Tables"]["work_tasks"]["Row"][];
  try {
    if (status === "done") {
      const { data: rows, error } = await build().order("completed_at", { ascending: false, nullsFirst: false }).limit(300);
      if (error) return serverError(error.message);
      data = rows || [];
    } else {
      data = await fetchAll((a, b) => build().order("due_date", { ascending: true, nullsFirst: false }).order("id").range(a, b));
    }
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Failed to load tasks");
  }

  let tasks = (data || []).map(mapTaskRow).filter((t) => taskVisible(t, ctx));
  if (assignee === "me") tasks = tasks.filter((t) => t.assigneeId === ctx.employeeId);
  else if (assignee && assignee !== "all") tasks = tasks.filter((t) => t.assigneeId === assignee);

  // Label the lead each follow-up belongs to, so a task row can say "Call Sneha — Lehenga enquiry".
  const leadIds = Array.from(new Set(tasks.filter((t) => t.linkType === "lead" && t.linkId).map((t) => t.linkId as string)));
  if (leadIds.length) {
    const names = new Map((await inBatches(leadIds, (ids) => db.from("leads").select("id, name").in("id", ids))).map((l) => [l.id, l.name]));
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
  // Independent look-ups (assignee, parent task, project, linked lead) run together instead of one after another.
  const [assigneeOk, parentRes, projectRes, leadRes] = await Promise.all([
    assigneeId ? isActiveEmployee(db, assigneeId) : Promise.resolve(true),
    d.parentTaskId ? db.from("work_tasks").select("*").eq("id", d.parentTaskId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    d.projectId ? loadProjectFor(db, ctx, d.projectId) : Promise.resolve(null),
    d.linkType === "lead" && d.linkId ? db.from("leads").select("assigned_employee_id, created_by").eq("id", d.linkId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  if (!assigneeOk) return badRequest("That person isn't an active staff member");
  if (d.parentTaskId) {
    if (!parentRes || !taskVisible(mapTaskRow(parentRes), ctx)) return badRequest("The parent task wasn't found");
    if (parentRes.parent_task_id) return badRequest("A subtask can't have its own subtasks");
  }
  if (d.projectId && !projectRes) return badRequest("The project wasn't found");
  if (d.linkType === "lead" && d.linkId && (!leadRes || !leadVisible(leadRes, ctx))) return badRequest("The lead wasn't found");
  if (d.dueDate && d.startDate && d.dueDate < d.startDate) return badRequest("The due date can't be before the start date");

  // A subtask always belongs to its parent's project; everything else it points at must belong to that project too.
  const projectId = parentRes ? parentRes.project_id : d.projectId;
  const refProblem = (await checkTaskWorkspaceRefs(db, projectId, d.taskListId, d.phaseId)) ?? (d.dependsOn?.length ? await checkDependencies(db, null, d.dependsOn, (row) => taskVisible(mapTaskRow(row), ctx)) : null);
  if (refProblem) return badRequest(refProblem);

  const { data, error } = await db
    .from("work_tasks")
    .insert({
      title: d.title,
      description: d.description,
      project_id: projectId,
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
  after(() => logTaskEvent(db, { taskId: data.id, projectId, kind: "created", body: `Task created: ${d.title}`, email: ctx.email }));

  if (assigneeId && assigneeId !== ctx.employeeId) after(() => logAction(db, ctx.email, `📌 Task assigned: ${d.title}`, null, d.dueDate ? `due ${d.dueDate}` : null));
  return NextResponse.json({ ok: true, id: data.id });
}
