import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { istDateString } from "@/lib/ist-date";
import { TARGET_METRICS } from "@/lib/targets";
import { badRequest, dateStr, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { loadTargetsWithProgress, targetsContext } from "@/lib/targets-server";
import { logAction } from "@/lib/logging";

const createSchema = z
  .object({
    title: text(120).min(1, "Give the target a name"),
    metric: z.enum(TARGET_METRICS),
    targetValue: z.number().positive("The goal must be more than 0"),
    startDate: dateStr,
    endDate: dateStr,
    scope: z.enum(["shop", "person"]),
    assigneeIds: z.array(uuid).max(30).default([]),
    productIds: z.array(uuid).max(200).default([]),
    garmentTypes: z.array(text(60)).max(100).default([]),
    notes: text(500).default(""),
    status: z.enum(["active", "draft"]).default("active"),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "The end date can't be before the start date", path: ["endDate"] })
  .refine((d) => d.scope === "shop" || d.assigneeIds.length > 0, { message: "Choose who this target is for", path: ["assigneeIds"] });

/** GET — the targets this person may see, each with live progress. */
export async function GET(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  try {
    const status = new URL(request.url).searchParams.get("status");
    let targets = await loadTargetsWithProgress(gate.ctx, istDateString());
    if (status === "active") targets = targets.filter((t) => ["on_track", "at_risk", "upcoming"].includes(t.progress.status));
    else if (status === "past") targets = targets.filter((t) => ["achieved", "missed", "cancelled"].includes(t.progress.status));
    return NextResponse.json({ targets });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Failed to load targets");
  }
}

/** POST — create a target (admin/manager: manageTargets). */
export async function POST(request: Request) {
  const gate = await targetsContext("manageTargets");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, createSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  if (d.assigneeIds.length) {
    const { data: found } = await db.from("employees").select("id").in("id", d.assigneeIds).eq("active", true);
    if ((found || []).length !== new Set(d.assigneeIds).size) return badRequest("One of the chosen people isn't an active staff member");
  }

  const { data, error } = await db
    .from("sales_targets")
    .insert({
      title: d.title,
      metric: d.metric,
      target_value: d.targetValue,
      start_date: d.startDate,
      end_date: d.endDate,
      scope: d.scope,
      assignee_ids: d.scope === "shop" ? [] : d.assigneeIds,
      product_ids: d.productIds,
      garment_types: d.garmentTypes,
      status_override: d.status === "draft" ? "draft" : null,
      notes: d.notes,
      created_by: ctx.email,
    })
    .select("id")
    .single();
  if (error || !data) return serverError(error?.message || "Couldn't create the target");

  await logAction(db, ctx.email, `🎯 Target created: ${d.title}`, null, `${d.metric} ${d.targetValue}, ${d.startDate} to ${d.endDate}`);
  return NextResponse.json({ ok: true, id: data.id });
}
