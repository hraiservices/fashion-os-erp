import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, dateStr, forbidden, parseBody, serverError, text } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";
import { mapPlannerRow } from "@/lib/targets-types";
import { PLANNER_KINDS } from "@/lib/planner";

const createSchema = z.object({
  entryDate: dateStr,
  kind: z.enum(PLANNER_KINDS as [string, ...string[]]).default("note"),
  text: text(2000).min(1, "Write something first"),
  reminderAt: z.string().datetime().nullable().optional(),
  linkType: z.enum(["lead", "customer", "order", "invoice"]).nullable().default(null),
  linkId: text(80).nullable().default(null),
  linkLabel: text(120).default(""),
});

/** GET — this person's own planner entries in a date range. `?from=YYYY-MM-DD&to=YYYY-MM-DD`
 *  (inclusive; day view sends the same date for both, week view sends Monday..Sunday). Private —
 *  always scoped to the caller, even for someone with viewAllTargets. */
export async function GET(request: Request) {
  const gate = await targetsContext("usePlanner");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  if (!ctx.employeeId) return forbidden("Your login isn't linked to a staff record");

  const sp = new URL(request.url).searchParams;
  const from = sp.get("from") || "";
  const to = sp.get("to") || from;
  if (!dateStr.safeParse(from).success || !dateStr.safeParse(to).success) return badRequest("Give a valid from/to date");

  const { data, error } = await db
    .from("planner_entries")
    .select("*")
    .eq("owner_id", ctx.employeeId)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date")
    .order("created_at");
  if (error) return serverError(error.message);
  return NextResponse.json({ entries: (data || []).map(mapPlannerRow) });
}

/** POST — create a planner entry for yourself. owner_id is always the caller, never client-supplied. */
export async function POST(request: Request) {
  const gate = await targetsContext("usePlanner");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  if (!ctx.employeeId) return forbidden("Your login isn't linked to a staff record");

  const body = await parseBody(request, createSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  const { data, error } = await db
    .from("planner_entries")
    .insert({
      owner_id: ctx.employeeId,
      entry_date: d.entryDate,
      kind: d.kind,
      text: d.text,
      reminder_at: d.reminderAt ?? null,
      link_type: d.linkId ? d.linkType : null,
      link_id: d.linkType ? d.linkId : null,
      link_label: d.linkId ? d.linkLabel : "",
    })
    .select("id")
    .single();
  if (error || !data) return serverError(error?.message || "Couldn't save that");
  return NextResponse.json({ ok: true, id: data.id });
}
