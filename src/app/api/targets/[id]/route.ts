import { NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { istDateString } from "@/lib/ist-date";
import { TARGET_METRICS } from "@/lib/targets";
import { badRequest, dateStr, notFound, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { loadTargetsWithProgress, targetsContext } from "@/lib/targets-server";
import { logAction } from "@/lib/logging";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: text(120).min(1).optional(),
  metric: z.enum(TARGET_METRICS).optional(),
  targetValue: z.number().positive().optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  scope: z.enum(["shop", "person"]).optional(),
  assigneeIds: z.array(uuid).max(30).optional(),
  productIds: z.array(uuid).max(200).optional(),
  garmentTypes: z.array(text(60)).max(100).optional(),
  notes: text(500).optional(),
  /** null = back to normal (active); "draft"/"cancelled" are manual overrides. */
  statusOverride: z.enum(["draft", "cancelled"]).nullable().optional(),
});

/** GET — one target with live progress (only if this person may see it). */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  try {
    const [target] = await loadTargetsWithProgress(gate.ctx, istDateString(), [id]);
    return target ? NextResponse.json({ target }) : notFound("Target not found");
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Failed to load the target");
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageTargets");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, patchSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  const { data: existing } = await db.from("sales_targets").select("*").eq("id", id).maybeSingle();
  if (!existing) return notFound("Target not found");

  const start = d.startDate ?? existing.start_date;
  const end = d.endDate ?? existing.end_date;
  if (end < start) return badRequest("The end date can't be before the start date");
  const scope = d.scope ?? existing.scope;
  const assignees = d.assigneeIds ?? existing.assignee_ids;
  if (scope === "person" && assignees.length === 0) return badRequest("Choose who this target is for");
  if (d.assigneeIds?.length) {
    const { data: found } = await db.from("employees").select("id").in("id", d.assigneeIds).eq("active", true);
    if ((found || []).length !== new Set(d.assigneeIds).size) return badRequest("One of the chosen people isn't an active staff member");
  }

  const { error } = await db
    .from("sales_targets")
    .update({
      ...(d.title !== undefined && { title: d.title }),
      ...(d.metric !== undefined && { metric: d.metric }),
      ...(d.targetValue !== undefined && { target_value: d.targetValue }),
      start_date: start,
      end_date: end,
      scope,
      assignee_ids: scope === "shop" ? [] : assignees,
      ...(d.productIds !== undefined && { product_ids: d.productIds }),
      ...(d.garmentTypes !== undefined && { garment_types: d.garmentTypes }),
      ...(d.notes !== undefined && { notes: d.notes }),
      ...(d.statusOverride !== undefined && { status_override: d.statusOverride }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return serverError(error.message);

  after(() => logAction(db, ctx.email, `🎯 Target updated: ${d.title ?? existing.title}`, null, d.statusOverride !== undefined ? `status → ${d.statusOverride ?? "active"}` : null));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageTargets");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const { data: existing } = await db.from("sales_targets").select("title").eq("id", id).maybeSingle();
  if (!existing) return notFound("Target not found");
  const { error } = await db.from("sales_targets").delete().eq("id", id);
  if (error) return serverError(error.message);
  after(() => logAction(db, ctx.email, `🗑️ Target deleted: ${existing.title}`, null, null));
  return NextResponse.json({ ok: true });
}
