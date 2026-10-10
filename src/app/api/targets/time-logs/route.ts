import { NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, dateStr, forbidden, isUuid, notFound, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { isActiveEmployee, logTaskEvent, mapTaskRow, targetsContext, taskVisible } from "@/lib/targets-server";
import { loadProjectFor } from "@/lib/targets-workspace";
import type { TimeLogDto } from "@/lib/targets-types";

const schema = z.object({
  taskId: uuid.nullable().default(null),
  projectId: uuid.nullable().default(null),
  logDate: dateStr,
  hours: z.number().min(0.25, "Log at least 15 minutes").max(24),
  note: text(300).default(""),
  /** Only people who see everyone's work may log time for someone else. */
  employeeId: uuid.nullable().optional(),
});

/** GET ?from&to&employee=<id>&project=<id>&task=<id> — time logs. Staff see their own; admin/manager see everyone's. */
export async function GET(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  const sp = new URL(request.url).searchParams;

  for (const key of ["project", "task", "employee"]) {
    const v = sp.get(key);
    if (v && v !== "all" && !isUuid(v)) return badRequest(`That ${key} id isn't valid`);
  }
  let q = db.from("work_time_logs").select("*").order("log_date", { ascending: false }).order("created_at", { ascending: false }).limit(3000);
  if (sp.get("from") && dateStr.safeParse(sp.get("from")).success) q = q.gte("log_date", sp.get("from")!);
  if (sp.get("to") && dateStr.safeParse(sp.get("to")).success) q = q.lte("log_date", sp.get("to")!);
  if (sp.get("project")) q = q.eq("project_id", sp.get("project")!);
  if (sp.get("task")) q = q.eq("task_id", sp.get("task")!);
  const employee = sp.get("employee");
  if (!ctx.seesAll) {
    if (!ctx.employeeId) return NextResponse.json({ logs: [] as TimeLogDto[] });
    q = q.eq("employee_id", ctx.employeeId);
  } else if (employee && employee !== "all") q = q.eq("employee_id", employee);

  const { data, error } = await q;
  if (error) return NextResponse.json({ logs: [] as TimeLogDto[] }); // workspace migration not run yet
  return NextResponse.json({ logs: (data || []).map((l): TimeLogDto => ({ id: l.id, taskId: l.task_id, projectId: l.project_id, employeeId: l.employee_id, logDate: l.log_date, hours: Number(l.hours), note: l.note, createdAt: l.created_at })) });
}

/** POST — log hours against a task and/or project. */
export async function POST(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const d = body.data;

  const who = d.employeeId === undefined || d.employeeId === null ? ctx.employeeId : d.employeeId;
  if (!who) return badRequest("Your login isn't linked to a staff record, so time can't be logged for you");
  if (who !== ctx.employeeId && !ctx.seesAll) return forbidden("You can only log your own time");
  if (!(await isActiveEmployee(db, who))) return badRequest("That person isn't an active staff member");

  let projectId = d.projectId;
  let taskProjectId: string | null = null;
  if (d.taskId) {
    const { data: t } = await db.from("work_tasks").select("*").eq("id", d.taskId).maybeSingle();
    if (!t || !taskVisible(mapTaskRow(t), ctx)) return notFound("Task not found");
    taskProjectId = t.project_id;
    projectId = t.project_id ?? projectId;
  }
  if (!d.taskId && !projectId) return badRequest("Pick a task or a project");
  // A project the time is logged against must be one this person can open. A task's own project is already covered
  // by their access to the task.
  if (projectId && projectId !== taskProjectId && !(await loadProjectFor(db, ctx, projectId))) return notFound("Project not found");

  const { data, error } = await db.from("work_time_logs").insert({ task_id: d.taskId, project_id: projectId, employee_id: who, log_date: d.logDate, hours: d.hours, note: d.note, created_by: ctx.email }).select("id").single();
  if (error || !data) return serverError(error?.message || "Couldn't save the time log");
  const loggedTaskId = d.taskId;
  if (loggedTaskId) after(() => logTaskEvent(db, { taskId: loggedTaskId, projectId, kind: "time", body: `Logged ${d.hours} h${d.note ? ` — ${d.note}` : ""}`, email: ctx.email }));
  return NextResponse.json({ ok: true, id: data.id });
}
