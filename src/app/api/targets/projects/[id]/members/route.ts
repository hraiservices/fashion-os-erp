import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, forbidden, notFound, parseBody, serverError, uuid } from "@/lib/targets-api";
import { loadStaff, targetsContext } from "@/lib/targets-server";
import { canManageProject, loadProjectFor } from "@/lib/targets-workspace";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ employeeIds: z.array(uuid).max(100) });

/** PUT — replace the project's member list. Project owner or admin/manager. Members can open the project and are listed under Users. */
export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const project = await loadProjectFor(db, ctx, id);
  if (!project) return notFound("Project not found");
  if (!canManageProject(ctx, project)) return forbidden("Only the project owner or a manager can change members");

  // Change only what changed: add the new members first, then remove the ones taken off. (Deleting everyone and
  // re-inserting could leave the project with no members at all if the second step failed.)
  const ids = Array.from(new Set(body.data.employeeIds));
  const { data: current, error: readErr } = await db.from("work_project_members").select("employee_id").eq("project_id", id);
  if (readErr) return serverError(readErr.message);
  const have = new Set((current || []).map((m) => m.employee_id));
  const toAdd = ids.filter((x) => !have.has(x));
  const toRemove = Array.from(have).filter((x) => !ids.includes(x));

  // Only people being ADDED have to be active — someone who has since left can stay on the list until removed.
  if (toAdd.length) {
    const active = new Set((await loadStaff(db)).filter((s) => s.active).map((s) => s.id));
    if (toAdd.some((x) => !active.has(x))) return badRequest("Members must be active staff");
    const { error } = await db.from("work_project_members").insert(toAdd.map((employee_id) => ({ project_id: id, employee_id })));
    if (error) return serverError(error.message);
  }
  if (toRemove.length) {
    const { error } = await db.from("work_project_members").delete().eq("project_id", id).in("employee_id", toRemove);
    if (error) return serverError(error.message);
  }
  return NextResponse.json({ ok: true });
}
