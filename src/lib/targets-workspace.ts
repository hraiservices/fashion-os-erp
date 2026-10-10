import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { TargetsCtx } from "@/lib/targets-server";

type ProjectRow = Database["public"]["Tables"]["work_projects"]["Row"];

/**
 * A project this person may open: they see everything, own it, created it, are a member, or have a
 * task in it. Returns null when it doesn't exist or isn't theirs (callers answer "not found" so a
 * project's existence isn't leaked).
 */
export async function loadProjectFor(db: SupabaseClient<Database>, ctx: TargetsCtx, projectId: string): Promise<ProjectRow | null> {
  const { data: project } = await db.from("work_projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) return null;
  if (ctx.seesAll) return project;
  if (ctx.employeeId && project.owner_id === ctx.employeeId) return project;
  if (project.created_by && project.created_by.toLowerCase() === ctx.email.toLowerCase()) return project;
  if (ctx.employeeId) {
    const [{ data: member }, { data: task }] = await Promise.all([
      db.from("work_project_members").select("employee_id").eq("project_id", projectId).eq("employee_id", ctx.employeeId).maybeSingle(),
      db.from("work_tasks").select("id").eq("project_id", projectId).eq("assignee_id", ctx.employeeId).limit(1).maybeSingle(),
    ]);
    if (member || task) return project;
  }
  return null;
}

/** May this person change a project's structure (task lists, phases, members)? Admin/manager, or the project's owner. */
export function canManageProject(ctx: TargetsCtx, project: Pick<ProjectRow, "owner_id">): boolean {
  return ctx.perms.manageTargets || (!!ctx.employeeId && project.owner_id === ctx.employeeId);
}

/** Only web links are accepted as document links. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * A task's task list and phase must belong to the task's own project — otherwise a task could sit in
 * one project but be grouped under another project's list. Returns a message for the user, or null
 * when the references are fine (or there are none).
 */
export async function checkTaskWorkspaceRefs(
  db: SupabaseClient<Database>,
  projectId: string | null,
  taskListId: string | null | undefined,
  phaseId: string | null | undefined
): Promise<string | null> {
  if (!taskListId && !phaseId) return null;
  if (!projectId) return "Choose a project before choosing a task list or phase";
  const [list, phase] = await Promise.all([
    taskListId ? db.from("work_task_lists").select("id").eq("id", taskListId).eq("project_id", projectId).maybeSingle() : Promise.resolve(null),
    phaseId ? db.from("work_phases").select("id").eq("id", phaseId).eq("project_id", projectId).maybeSingle() : Promise.resolve(null),
  ]);
  if (taskListId && !list?.data) return "That task list isn't in this project";
  if (phaseId && !phase?.data) return "That phase isn't in this project";
  return null;
}

type TaskRow = Database["public"]["Tables"]["work_tasks"]["Row"];

/**
 * The tasks a task says it "depends on" must exist, be ones this person can see, and not point back
 * at it (a direct loop would leave both waiting for each other forever). Returns a message or null.
 */
export async function checkDependencies(
  db: SupabaseClient<Database>,
  taskId: string | null,
  dependsOn: string[],
  visible: (row: TaskRow) => boolean
): Promise<string | null> {
  if (!dependsOn.length) return null;
  const ids = Array.from(new Set(dependsOn));
  const { data } = await db.from("work_tasks").select("*").in("id", ids);
  const rows = data || [];
  if (rows.length !== ids.length || rows.some((r) => !visible(r))) return "One of the tasks it depends on wasn't found";
  if (taskId && rows.some((r) => (r.depends_on || []).includes(taskId))) return "Those tasks already wait for this one, so this would be a loop";
  return null;
}
