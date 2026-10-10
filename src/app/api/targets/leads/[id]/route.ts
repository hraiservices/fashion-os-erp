import { NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { DEFAULT_STAGE_LABELS, LEAD_STAGES, validateStageChange, wonValueFor, isLeadStage } from "@/lib/lead-stages";
import { badRequest, forbidden, notFound, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { addLeadActivity, ensureCustomerForLead, isActiveEmployee, leadVisible, mapActivityRow, mapLeadRow, mapTaskRow, targetsContext, taskVisible } from "@/lib/targets-server";
import { logAction } from "@/lib/logging";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: text(120).min(1).optional(),
  mobile: text(20).optional(),
  source: text(60).optional(),
  productInterest: text(200).optional(),
  expectedValue: z.number().min(0).max(100_000_000).optional(),
  likelyToClose: z.boolean().optional(),
  assignedEmployeeId: uuid.nullable().optional(),
  notes: text(1000).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  lostReason: text(200).optional(),
  wonValue: z.number().min(0).max(100_000_000).optional(),
});

/** GET — one lead with its timeline and linked tasks. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const { data: row } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (!row || !leadVisible(row, ctx)) return notFound("Lead not found");

  const [{ data: acts }, { data: tasks }] = await Promise.all([
    db.from("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(200),
    db.from("work_tasks").select("*").eq("link_type", "lead").eq("link_id", id).order("due_date", { ascending: true, nullsFirst: false }),
  ]);
  return NextResponse.json({
    lead: mapLeadRow(row),
    activities: (acts || []).map(mapActivityRow),
    tasks: (tasks || []).map(mapTaskRow).filter((t) => taskVisible(t, ctx)),
  });
}

/** PATCH — edit a lead and/or move it to another stage. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, patchSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  const { data: row } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (!row || !leadVisible(row, ctx)) return notFound("Lead not found");

  const update: Database["public"]["Tables"]["leads"]["Update"] = { updated_at: new Date().toISOString() };
  if (d.name !== undefined) update.name = d.name;
  if (d.source !== undefined) update.source = d.source;
  if (d.productInterest !== undefined) update.product_interest = d.productInterest;
  if (d.expectedValue !== undefined) update.expected_value = d.expectedValue;
  if (d.notes !== undefined) update.notes = d.notes;
  if (d.mobile !== undefined) {
    const mobile = d.mobile ? normalizeIndianMobile(d.mobile) : "";
    if (d.mobile && mobile.length < 10) return badRequest("That mobile number doesn't look right");
    update.mobile = mobile;
  }

  if (d.assignedEmployeeId !== undefined && d.assignedEmployeeId !== row.assigned_employee_id) {
    const canAssignOthers = ctx.seesAll || ctx.perms.assignTasks;
    if (d.assignedEmployeeId !== ctx.employeeId && !canAssignOthers) return forbidden("You can't reassign leads to other people");
    if (d.assignedEmployeeId && !(await isActiveEmployee(db, d.assignedEmployeeId))) return badRequest("That person isn't an active staff member");
    update.assigned_employee_id = d.assignedEmployeeId;
  }

  let stageNote: string | null = null;
  const nextStage = d.stage ?? row.stage;
  if (d.stage && d.stage !== row.stage) {
    if (!isLeadStage(d.stage)) return badRequest("Unknown stage");
    // A lead that was won through a real order or invoice stays won: moving it away would leave a sale on the books
    // that no lead — and no salesperson's target — gets credit for.
    if (row.stage === "won" && (row.order_id || row.invoice_id)) return NextResponse.json({ error: "This lead has an order or sale linked to it, so it can't be moved out of Won." }, { status: 409 });
    const err = validateStageChange({ from: row.stage, to: d.stage, lostReason: d.lostReason ?? row.lost_reason });
    if (err) return badRequest(err);
    update.stage = d.stage;
    const now = new Date().toISOString();
    if (d.stage === "won") {
      update.won_at = now;
      update.won_value = wonValueFor({ enteredValue: d.wonValue, expectedValue: Number(row.expected_value) || 0 });
      update.lost_at = null;
      update.lost_reason = "";
      update.likely_to_close = false;
      // A won lead becomes a normal Customer (never overwriting an existing one). A lead with no
      // number yet just stays unlinked — the order/invoice form will ask for it.
      try {
        const customerId = await ensureCustomerForLead(db, { name: d.name ?? row.name, mobile: (update.mobile as string | undefined) ?? row.mobile });
        if (customerId) update.customer_id = customerId;
      } catch {
        /* non-fatal — the lead is still marked Won */
      }
    } else if (d.stage === "lost") {
      update.lost_at = now;
      update.lost_reason = (d.lostReason ?? "").trim();
      update.won_at = null;
      update.won_value = 0;
      update.likely_to_close = false;
    } else {
      update.won_at = null;
      update.lost_at = null;
      update.won_value = 0;
      update.lost_reason = "";
    }
    stageNote = `Moved from ${DEFAULT_STAGE_LABELS[row.stage as keyof typeof DEFAULT_STAGE_LABELS] ?? row.stage} to ${DEFAULT_STAGE_LABELS[d.stage]}${d.stage === "lost" && d.lostReason ? ` — ${d.lostReason}` : ""}`;
  }
  // The "likely to close" star only means something while the lead is still open.
  if (d.likelyToClose !== undefined) update.likely_to_close = nextStage === "won" || nextStage === "lost" ? false : d.likelyToClose;

  const { error } = await db.from("leads").update(update).eq("id", id);
  if (error) return serverError(error.message);

  if (stageNote) {
    await addLeadActivity(db, id, "stage_change", stageNote, ctx.email);
    after(() => logAction(db, ctx.email, `🤝 Lead ${d.stage === "won" ? "won" : d.stage === "lost" ? "lost" : "moved"}: ${row.name}`, null, stageNote));
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE — only a lead nobody has touched (no timeline, no order/invoice). Once a lead has
 * history it is marked Lost instead, so win-rate numbers stay honest.
 */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const { data: row } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (!row || !leadVisible(row, ctx)) return notFound("Lead not found");
  if (row.order_id || row.invoice_id || row.stage === "won") return NextResponse.json({ error: "This lead has an order or sale linked to it, so it can't be deleted." }, { status: 409 });

  const { count } = await db.from("lead_activities").select("id", { count: "exact", head: true }).eq("lead_id", id);
  if ((count || 0) > 0) return NextResponse.json({ error: "This lead already has history. Mark it Lost instead of deleting it." }, { status: 409 });

  const { error } = await db.from("leads").delete().eq("id", id);
  if (error) return serverError(error.message);
  await db.from("work_tasks").delete().eq("link_type", "lead").eq("link_id", id);
  after(() => logAction(db, ctx.email, `🗑️ Lead deleted: ${row.name}`, null, null));
  return NextResponse.json({ ok: true });
}
