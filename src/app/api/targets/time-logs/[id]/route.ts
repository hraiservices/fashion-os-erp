import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { forbidden, notFound, serverError } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE — your own time log, or anyone's if you see everything. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const { data: log } = await db.from("work_time_logs").select("employee_id").eq("id", id).maybeSingle();
  if (!log) return notFound("Time log not found");
  if (!ctx.seesAll && !(ctx.employeeId && log.employee_id === ctx.employeeId)) return forbidden("You can only remove your own time logs");
  const { error } = await db.from("work_time_logs").delete().eq("id", id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
