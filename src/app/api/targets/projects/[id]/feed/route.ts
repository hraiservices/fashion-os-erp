import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { notFound } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";
import { loadProjectFor } from "@/lib/targets-workspace";
import type { TaskEventDto } from "@/lib/targets-types";

type Ctx = { params: Promise<{ id: string }> };

/** GET — the project's Feed: comments and activity from all its tasks, newest first. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  if (!(await loadProjectFor(db, ctx, id))) return notFound("Project not found");

  const { data, error } = await db.from("work_task_events").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ events: [] as TaskEventDto[] });
  const taskIds = Array.from(new Set((data || []).map((e) => e.task_id).filter((x): x is string => !!x)));
  const titles = new Map<string, string>();
  if (taskIds.length) {
    const { data: tasks } = await db.from("work_tasks").select("id, title").in("id", taskIds);
    for (const t of tasks || []) titles.set(t.id, t.title);
  }
  const events: TaskEventDto[] = (data || []).map((e) => ({ id: e.id, projectId: e.project_id, taskId: e.task_id, kind: e.kind, body: e.body, createdBy: e.created_by, createdAt: e.created_at, taskTitle: e.task_id ? titles.get(e.task_id) ?? null : null }));
  return NextResponse.json({ events });
}
