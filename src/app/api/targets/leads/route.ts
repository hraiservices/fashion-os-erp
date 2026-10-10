import { NextResponse, after } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { LEAD_STAGES, OPEN_STAGES } from "@/lib/lead-stages";
import { badRequest, forbidden, isUuid, parseBody, serverError, text, uuid } from "@/lib/targets-api";
import { isActiveEmployee, mapLeadRow, nextFollowUps, ownershipFilter, targetsContext } from "@/lib/targets-server";
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
    if (owner && owner !== "me" && !isUuid(owner)) return badRequest("That owner id isn't valid");
    // Characters that mean something inside a PostgREST filter string — dropped from the search text.
    const q = (sp.get("q") || "").trim().replace(/[,()%*"\\]/g, " ").trim();
    const limit = Math.min(5000, Math.max(1, parseInt(sp.get("limit") || "500", 10) || 500));

    // Who may see which leads is decided in the database, so a staff member's list never loads everyone's.
    const mine = ownershipFilter(ctx, "assigned_employee_id");

    // A fresh query per page (a single request stops at 1000 rows, so a long list is read in pages).
    const filtered = () => {
      let l = db.from("leads").select("*", { count: "exact" });
      if (mine) l = l.or(mine);
      if (owner === "me") l = ctx.employeeId ? l.eq("assigned_employee_id", ctx.employeeId) : l.eq("id", "00000000-0000-0000-0000-000000000000");
      else if (owner && ctx.seesAll) l = l.eq("assigned_employee_id", owner);
      if (stage === "open") l = l.in("stage", OPEN_STAGES as unknown as string[]);
      else if (stage !== "all") l = l.eq("stage", stage);
      if (sp.get("likely") === "1") l = l.eq("likely_to_close", true);
      if (q) {
        const like = `%${q}%`;
        l = l.or(`name.ilike.${like},mobile.ilike.${like},product_interest.ilike.${like},source.ilike.${like}`);
      }
      return l.order("created_at", { ascending: false }).order("id");
    };

    // Stage counts ignore the owner/stage/search filters (they label the stage pills), so they are counted
    // separately in the database — one cheap indexed count per stage, run alongside the list.
    const counts = LEAD_STAGES.map((s) => {
      const c = db.from("leads").select("id", { count: "exact", head: true }).eq("stage", s);
      return mine ? c.or(mine) : c;
    });
    const rows: Database["public"]["Tables"]["leads"]["Row"][] = [];
    let total = 0;
    const firstPage = filtered().range(0, Math.min(limit, 1000) - 1);
    const [first, ...countRes] = await Promise.all([firstPage, ...counts]);
    if (first.error) return serverError(first.error.message);
    rows.push(...(first.data || []));
    total = first.count ?? rows.length;
    for (let from = rows.length; rows.length < limit && rows.length < total; from = rows.length) {
      const page = await filtered().range(from, Math.min(from + 999, limit - 1));
      if (page.error) return serverError(page.error.message);
      if (!page.data?.length) break;
      rows.push(...page.data);
    }
    const stageCounts: Record<string, number> = {};
    LEAD_STAGES.forEach((s, i) => (stageCounts[s] = countRes[i].count ?? 0));

    const follow = await nextFollowUps(db, rows.map((r) => r.id));
    return NextResponse.json({ leads: rows.map((r) => ({ ...mapLeadRow(r), nextFollowUp: follow.get(r.id) ?? null })), stageCounts, total });
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
  // The owner check and the duplicate-number check don't depend on each other — run them together.
  const [ownerOk, dupes] = await Promise.all([
    owner ? isActiveEmployee(db, owner) : Promise.resolve(true),
    mobile && !d.allowDuplicate
      ? db.from("leads").select("id, name, stage").eq("mobile", mobile).in("stage", ["new", "talking", "visit", "quoted"]).limit(1).then((r) => r.data)
      : Promise.resolve(null),
  ]);
  if (!ownerOk) return badRequest("That person isn't an active staff member");
  if (dupes?.length) return NextResponse.json({ error: `There is already an open lead for this number (${dupes[0].name})`, duplicateOf: dupes[0].id }, { status: 409 });

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

  after(() => logAction(db, ctx.email, `🤝 Lead added: ${d.name}`, null, d.productInterest || null));
  return NextResponse.json({ ok: true, id: data.id });
}
