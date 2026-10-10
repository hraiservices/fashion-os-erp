import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { isOpenStage, LEAD_STAGES } from "@/lib/lead-stages";
import { badRequest, forbidden, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { fetchLeadRows, isActiveEmployee, leadVisible, mapLeadRow, nextFollowUps, targetsContext } from "@/lib/targets-server";
import { logAction } from "@/lib/logging";

const createSchema = z.object({
  name: text(120).min(1, "Enter the person's name"),
  mobile: text(20).default(""),
  source: text(60).default(""),
  productInterest: text(200).default(""),
  expectedValue: z.number().min(0).max(100_000_000).default(0),
  likelyToClose: z.boolean().default(false),
  assignedEmployeeId: uuid.nullable().optional(),
  notes: text(1000).default(""),
  /** Create even if an open lead for the same number already exists. */
  allowDuplicate: z.boolean().default(false),
});

/** GET — leads this person may see. ?stage=open|all|<stage>  ?owner=me|<employeeId>  ?q=text  ?likely=1 */
export async function GET(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  try {
    const sp = new URL(request.url).searchParams;
    const stage = sp.get("stage") || "open";
    const owner = sp.get("owner");
    const q = (sp.get("q") || "").trim().toLowerCase();

    let rows = (await fetchLeadRows(db)).filter((r) => leadVisible(r, ctx));
    const stageCounts: Record<string, number> = {};
    for (const s of LEAD_STAGES) stageCounts[s] = rows.filter((r) => r.stage === s).length;

    if (owner === "me") rows = rows.filter((r) => r.assigned_employee_id === ctx.employeeId);
    else if (owner && ctx.seesAll) rows = rows.filter((r) => r.assigned_employee_id === owner);
    if (stage === "open") rows = rows.filter((r) => isOpenStage(r.stage));
    else if (stage !== "all") rows = rows.filter((r) => r.stage === stage);
    if (sp.get("likely") === "1") rows = rows.filter((r) => r.likely_to_close);
    if (q) rows = rows.filter((r) => [r.name, r.mobile, r.product_interest, r.source].some((f) => (f || "").toLowerCase().includes(q)));
    rows = rows.slice(0, 500);

    const follow = await nextFollowUps(db, rows.map((r) => r.id));
    return NextResponse.json({ leads: rows.map((r) => ({ ...mapLeadRow(r), nextFollowUp: follow.get(r.id) ?? null })), stageCounts });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Failed to load leads");
  }
}

/** POST — add a lead (manageLeads). Defaults the owner to the person adding it. */
export async function POST(request: Request) {
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, createSchema);
  if ("error" in body) return body.error;
  const d = body.data;

  const mobile = d.mobile ? normalizeIndianMobile(d.mobile) : "";
  if (d.mobile && mobile.length < 10) return badRequest("That mobile number doesn't look right");

  // Staff without the assign permission can only own their own leads.
  const canAssignOthers = ctx.seesAll || ctx.perms.assignTasks;
  const owner = d.assignedEmployeeId === undefined ? ctx.employeeId : d.assignedEmployeeId;
  if (owner && owner !== ctx.employeeId && !canAssignOthers) return forbidden("You can only add leads for yourself");
  if (owner && !(await isActiveEmployee(db, owner))) return badRequest("That person isn't an active staff member");

  if (mobile && !d.allowDuplicate) {
    const { data: dupes } = await db.from("leads").select("id, name, stage").eq("mobile", mobile).in("stage", ["new", "talking", "visit", "quoted"]).limit(1);
    if (dupes?.length) return NextResponse.json({ error: `There is already an open lead for this number (${dupes[0].name})`, duplicateOf: dupes[0].id }, { status: 409 });
  }

  const { data, error } = await db
    .from("leads")
    .insert({
      name: d.name,
      mobile,
      source: d.source,
      product_interest: d.productInterest,
      expected_value: d.expectedValue,
      likely_to_close: d.likelyToClose,
      assigned_employee_id: owner ?? null,
      notes: d.notes,
      created_by: ctx.email,
    })
    .select("id")
    .single();
  if (error || !data) return serverError(error?.message || "Couldn't add the lead");

  await logAction(db, ctx.email, `🤝 Lead added: ${d.name}`, null, d.productInterest || null);
  return NextResponse.json({ ok: true, id: data.id });
}
