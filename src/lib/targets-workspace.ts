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
