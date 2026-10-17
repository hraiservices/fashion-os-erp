import { NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, isUuid, notFound, parseBody, serverError, uuid } from "@/lib/targets-api";
import { addLeadActivity, leadVisible, targetsContext } from "@/lib/targets-server";
import { logAction } from "@/lib/logging";

const schema = z.object({ fromId: uuid });

/**
 * POST — merge a duplicate lead (`fromId`) INTO this one (`id`). Everything the duplicate collected — its
 * history, files, follow-up tasks and any linked order — moves to this lead, blanks on this lead are filled from
 * the duplicate, and then the duplicate is removed. A lead that is already Won or has an order/invoice behind it
 * can't be the one removed: that would orphan a real sale.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;
  const fromId = body.data.fromId;
  if (!isUuid(id) || id === fromId) return badRequest("Pick a different lead to merge in");

  const [{ data: keep }, { data: dupe }] = await Promise.all([db.from("leads").select("*").eq("id", id).maybeSingle(), db.from("leads").select("*").eq("id", fromId).maybeSingle()]);
  if (!keep || !leadVisible(keep, ctx) || !dupe || !leadVisible(dupe, ctx)) return notFound("Lead not found");
  if (dupe.stage === "won" || dupe.order_id || dupe.invoice_id) {
    return NextResponse.json({ error: `${dupe.name} has a sale linked to it, so it can't be merged away. Open that lead and merge the other one into it instead.` }, { status: 409 });
  }

  try {
    const moves = await Promise.all([
      db.from("lead_activities").update({ lead_id: id }).eq("lead_id", fromId),
      db.from("lead_attachments").update({ lead_id: id }).eq("lead_id", fromId),
      db.from("work_tasks").update({ link_id: id }).eq("link_type", "lead").eq("link_id", fromId),
      db.from("orders").update({ lead_id: id }).eq("lead_id", fromId),
    ]);
    // lead_attachments only exists once its migration has run — a missing table is not a failure.
    const failed = moves.find((m, i) => m.error && !(i === 1 && /lead_attachments/.test(m.error.message)));
    if (failed?.error) return serverError(failed.error.message);

    const notes = [keep.notes, dupe.notes && !keep.notes.includes(dupe.notes) ? dupe.notes : ""].filter(Boolean).join("\n").slice(0, 1000);
    const fill: Database["public"]["Tables"]["leads"]["Update"] = { updated_at: new Date().toISOString(), notes };
    if (!keep.mobile && dupe.mobile) fill.mobile = dupe.mobile;
    if (!keep.source && dupe.source) fill.source = dupe.source;
    if (!keep.product_interest && dupe.product_interest) fill.product_interest = dupe.product_interest;
    if (!keep.assigned_employee_id && dupe.assigned_employee_id) fill.assigned_employee_id = dupe.assigned_employee_id;
    if ((Number(dupe.expected_value) || 0) > (Number(keep.expected_value) || 0)) fill.expected_value = dupe.expected_value;
    if (dupe.likely_to_close && keep.stage !== "won" && keep.stage !== "lost") fill.likely_to_close = true;
    const upd = await db.from("leads").update(fill).eq("id", id);
    if (upd.error) return serverError(upd.error.message);

    await addLeadActivity(db, id, "note", `Merged in a duplicate lead: ${dupe.name}${dupe.mobile ? ` (${dupe.mobile})` : ""}, stage ${dupe.stage}.`, ctx.email);
    const del = await db.from("leads").delete().eq("id", fromId);
    if (del.error) return serverError(del.error.message);
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Couldn't merge the leads");
  }

  after(() => logAction(db, ctx.email, `🤝 Leads merged: ${dupe.name} into ${keep.name}`, null, null));
  return NextResponse.json({ ok: true });
}
