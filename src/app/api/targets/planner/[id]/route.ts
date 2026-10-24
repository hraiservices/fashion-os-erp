import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { dateStr, forbidden, notFound, parseBody, serverError, text } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";
import { PLANNER_KINDS } from "@/lib/planner";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  entryDate: dateStr.optional(),
  kind: z.enum(PLANNER_KINDS as [string, ...string[]]).optional(),
  text: text(2000).min(1).optional(),
  done: z.boolean().optional(),
  reminderAt: z.string().datetime().nullable().optional(),
  linkType: z.enum(["lead", "customer", "order", "invoice"]).nullable().optional(),
  linkId: text(80).nullable().optional(),
  linkLabel: text(120).optional(),
});

/** Loads the row only if it belongs to the caller — never leaks whether a row exists for someone
 *  else; a mismatch and a missing row both come back as plain "not found." */
async function loadOwn(db: SupabaseClient<Database>, id: string, ownerId: string) {
  const { data } = await db.from("planner_entries").select("*").eq("id", id).maybeSingle();
  return data && data.owner_id === ownerId ? data : null;
}

/** PATCH — edit an entry: tick it off, change its text/date/reminder, set or clear its link. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("usePlanner");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  if (!ctx.employeeId) return forbidden("Your login isn't linked to a staff record");

  const body = await parseBody(request, patchSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  const row = await loadOwn(db, id, ctx.employeeId);
  if (!row) return notFound("Planner entry not found");

  const update: Database["public"]["Tables"]["planner_entries"]["Update"] = { updated_at: new Date().toISOString() };
  if (d.entryDate !== undefined) update.entry_date = d.entryDate;
  if (d.kind !== undefined) update.kind = d.kind;
  if (d.text !== undefined) update.text = d.text;
  if (d.done !== undefined) update.done = d.done;
  if (d.reminderAt !== undefined) {
    update.reminder_at = d.reminderAt;
    // Changing the reminder time re-arms it for the daily push, same as moving a task's due date.
    update.reminder_sent_for = null;
  }
  if (d.linkType !== undefined || d.linkId !== undefined) {
    const linkId = d.linkId !== undefined ? d.linkId : row.link_id;
    const linkType = d.linkType !== undefined ? d.linkType : row.link_type;
    update.link_id = linkId;
    update.link_type = linkId ? linkType : null;
    update.link_label = linkId ? d.linkLabel ?? row.link_label : "";
  } else if (d.linkLabel !== undefined && row.link_id) {
    update.link_label = d.linkLabel;
  }

  const { error } = await db.from("planner_entries").update(update).eq("id", id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}

/** DELETE — the owner only. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("usePlanner");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;
  if (!ctx.employeeId) return forbidden("Your login isn't linked to a staff record");

  const row = await loadOwn(db, id, ctx.employeeId);
  if (!row) return notFound("Planner entry not found");

  const { error } = await db.from("planner_entries").delete().eq("id", id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
