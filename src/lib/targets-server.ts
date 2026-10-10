import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCachedAppSetting } from "@/lib/supabase/app-settings-cache";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_ENTITLEMENTS, isModuleEnabled, type ModuleEntitlements } from "@/lib/entitlements";
import type { Permissions } from "@/lib/permissions";
import { customerIdFromMobile, normalizeIndianMobile } from "@/lib/business-rules";
import { istDateString } from "@/lib/ist-date";
import { OPEN_STAGES } from "@/lib/lead-stages";
import { computeProgress, monthRange, type LeadFact, type SaleFact, type SaleLine, type TargetDef } from "@/lib/targets";
import { mapActivityRow, mapLeadRow, mapTargetRow, mapTaskRow, type LeadDto, type StaffOption, type TargetDto, type TargetWithProgress, type TaskDto } from "@/lib/targets-types";
import { bucketTasks, isOverdue, taskVisibleTo } from "@/lib/work-tasks";

/**
 * Server-side helpers for the Targets module. Every function takes the SERVICE-ROLE client as
 * `db: SupabaseClient<Database>` (the tables involved — leads, targets, tasks, plus orders,
 * invoices, employees, customers — are locked against the caller's own session), so callers must
 * have run `targetsContext()` first: that is where login, module licensing and permissions are checked.
 */

export interface TargetsCtx {
  email: string;
  role: string;
  perms: Permissions;
  /** The employees row this login is linked to; null for a login with no staff record. */
  employeeId: string | null;
  /** Sees everyone's leads, tasks and targets (viewAllTargets). Everyone else sees only their own. */
  seesAll: boolean;
  db: SupabaseClient<Database>;
}

/**
 * Login + licensing + permission gate for every /api/targets route. `need` is an extra permission
 * flag on top of the baseline `accessTargets`. API routes bypass the page-level module guard, so the
 * licensing check lives here too.
 */
export async function targetsContext(need?: keyof Permissions): Promise<{ ctx: TargetsCtx } | { error: NextResponse }> {
  const { supabase, user } = await getServerUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (!user.perms.accessTargets) return { error: NextResponse.json({ error: "No permission to use Targets" }, { status: 403 }) };
  if (need && !user.perms[need]) return { error: NextResponse.json({ error: "You don't have permission to do that" }, { status: 403 }) };

  const entValue = await getCachedAppSetting(supabase, "moduleEntitlements");
  const entitlements: ModuleEntitlements = { ...DEFAULT_ENTITLEMENTS, ...(entValue as Partial<ModuleEntitlements> | null) };
  if (!isModuleEnabled(entitlements, "targets")) return { error: NextResponse.json({ error: "The Targets module isn't enabled for this shop" }, { status: 403 }) };

  const db = createServiceClient();
  if (!db) return { error: NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 }) };

  return { ctx: { email: user.email, role: user.role, perms: user.perms, employeeId: user.employeeId, seesAll: !!user.perms.viewAllTargets, db } };
}

/** Fetches every row of a query, paging past PostgREST's 1000-row cap. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const dateOf = (ts: string | null | undefined): string | null => (ts ? istDateString(new Date(ts)) : null);

// ── Staff and lookups ─────────────────────────────────────────────────────

export async function loadStaff(db: SupabaseClient<Database>): Promise<StaffOption[]> {
  const { data } = await db.from("employees").select("id, name, role, active").order("name");
  return (data || []).map((e) => ({ id: e.id, name: e.name, role: e.role, active: e.active }));
}

export async function isActiveEmployee(db: SupabaseClient<Database>, id: string): Promise<boolean> {
  const { data } = await db.from("employees").select("id, active").eq("id", id).maybeSingle();
  return !!data?.active;
}

// ── Facts: real orders and invoices turned into credited sales ────────────

/**
 * Orders (credited via the lead they came from) and non-draft invoices (credited via
 * sales_person_id) dated inside [from, to], as plain facts for the engine in targets.ts.
 */
export async function fetchSaleFacts(db: SupabaseClient<Database>, from: string, to: string): Promise<SaleFact[]> {
  const [orders, invoices] = await Promise.all([
    fetchAll((a, b) => db.from("orders").select("id, in_date, total, garments, lead_id").gte("in_date", from).lte("in_date", to).range(a, b)),
    fetchAll((a, b) => db.from("sales_invoices").select("id, invoice_date, total, items, doc_status, sales_person_id").gte("invoice_date", from).lte("invoice_date", to).range(a, b)),
  ]);

  const leadIds = Array.from(new Set(orders.map((o) => o.lead_id).filter((x): x is string => !!x)));
  const ownerByLead = new Map<string, string | null>();
  if (leadIds.length) {
    const { data } = await db.from("leads").select("id, assigned_employee_id").in("id", leadIds);
    for (const l of data || []) ownerByLead.set(l.id, l.assigned_employee_id);
  }

  const facts: SaleFact[] = [];
  for (const o of orders) {
    const garments = (Array.isArray(o.garments) ? o.garments : []) as { type?: string; no?: number; amount?: number }[];
    const lines: SaleLine[] = garments.map((g) => ({ garmentType: g.type || null, qty: g.no || 1, amount: Number(g.amount) || 0 }));
    facts.push({ kind: "order", id: o.id, date: String(o.in_date).slice(0, 10), personId: o.lead_id ? ownerByLead.get(o.lead_id) ?? null : null, value: Number(o.total) || 0, lines });
  }
  for (const i of invoices) {
    if (["draft", "void", "cancelled"].includes(i.doc_status)) continue;
    const items = (Array.isArray(i.items) ? i.items : []) as { productId?: string; qty?: number; amount?: number }[];
    const lines: SaleLine[] = items.map((it) => ({ productId: it.productId || null, qty: Number(it.qty) || 0, amount: Number(it.amount) || 0 }));
    facts.push({ kind: "invoice", id: i.id, date: String(i.invoice_date).slice(0, 10), personId: i.sales_person_id, value: Number(i.total) || 0, lines });
  }
  return facts;
}

export function leadFactOf(r: Database["public"]["Tables"]["leads"]["Row"]): LeadFact {
  return {
    id: r.id,
    stage: r.stage,
    assignedEmployeeId: r.assigned_employee_id,
    expectedValue: Number(r.expected_value) || 0,
    likelyToClose: !!r.likely_to_close,
    wonValue: Number(r.won_value) || 0,
    wonDate: dateOf(r.won_at),
    source: r.source || "",
    createdDate: dateOf(r.created_at) || undefined,
    lostReason: r.lost_reason || "",
    lostDate: dateOf(r.lost_at),
  };
}

export async function fetchLeadRows(db: SupabaseClient<Database>): Promise<Database["public"]["Tables"]["leads"]["Row"][]> {
  return fetchAll((a, b) => db.from("leads").select("*").order("created_at", { ascending: false }).range(a, b));
}

// ── Visibility ────────────────────────────────────────────────────────────

export function leadVisible(r: Pick<Database["public"]["Tables"]["leads"]["Row"], "assigned_employee_id" | "created_by">, ctx: TargetsCtx): boolean {
  if (ctx.seesAll) return true;
  if (ctx.employeeId && r.assigned_employee_id === ctx.employeeId) return true;
  return !!r.created_by && r.created_by.toLowerCase() === ctx.email.toLowerCase();
}

export function targetVisible(t: Pick<TargetDto, "scope" | "assigneeIds">, ctx: TargetsCtx): boolean {
  if (ctx.seesAll) return true;
  if (t.scope === "shop") return true;
  return !!ctx.employeeId && t.assigneeIds.includes(ctx.employeeId);
}

export function taskVisible(t: Pick<TaskDto, "assigneeId" | "createdBy">, ctx: TargetsCtx): boolean {
  return taskVisibleTo(t, { employeeId: ctx.employeeId, email: ctx.email, seesAll: ctx.seesAll });
}

// ── Targets with live progress ────────────────────────────────────────────

const toDef = (t: TargetDto): TargetDef => ({
  id: t.id,
  title: t.title,
  metric: t.metric,
  targetValue: t.targetValue,
  startDate: t.startDate,
  endDate: t.endDate,
  scope: t.scope,
  assigneeIds: t.assigneeIds,
  productIds: t.productIds,
  garmentTypes: t.garmentTypes,
  statusOverride: t.statusOverride,
});

export async function loadTargetsWithProgress(ctx: TargetsCtx, today: string, ids?: string[]): Promise<TargetWithProgress[]> {
  const { db } = ctx;
  let q = db.from("sales_targets").select("*").order("end_date", { ascending: false });
  if (ids) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const targets = (data || []).map(mapTargetRow).filter((t) => targetVisible(t, ctx));
  if (!targets.length) return [];

  const from = targets.reduce((m, t) => (t.startDate < m ? t.startDate : m), targets[0].startDate);
  const to = targets.reduce((m, t) => (t.endDate > m ? t.endDate : m), targets[0].endDate);
  const needsSales = targets.some((t) => t.metric !== "leads_won");
  const [sales, leadRows] = await Promise.all([needsSales ? fetchSaleFacts(db, from, to) : Promise.resolve([] as SaleFact[]), fetchLeadRows(db)]);
  const leads = leadRows.map(leadFactOf);

  return targets.map((t) => ({ ...t, progress: computeProgress(toDef(t), sales, leads, today) }));
}

// ── Leads → customer ──────────────────────────────────────────────────────

/**
 * Links a lead to a Customer, creating the customer only if none exists for that mobile (same
 * defaults the orders route uses). Never an upsert: that would overwrite an existing customer's
 * name and details. Returns the customer id, or null when the lead has no usable mobile yet.
 */
export async function ensureCustomerForLead(db: SupabaseClient<Database>, lead: Pick<LeadDto, "name" | "mobile">): Promise<string | null> {
  const mobile = normalizeIndianMobile(lead.mobile || "");
  if (!mobile) return null;
  const id = customerIdFromMobile(mobile);
  const { data: existing } = await db.from("customers").select("id").eq("id", id).maybeSingle();
  if (existing) return existing.id;
  const { error } = await db.from("customers").insert({ id, name: lead.name, mobile, measurements: {}, loyalty_points: 0, total_points_earned: 0, loyalty_history: [] });
  if (error) throw new Error(error.message);
  return id;
}

export async function addLeadActivity(db: SupabaseClient<Database>, leadId: string, kind: "note" | "call" | "meeting" | "stage_change", body: string, email: string) {
  await db.from("lead_activities").insert({ lead_id: leadId, kind, body, created_by: email });
}

/** The soonest open task linked to each lead — the lead's "next follow-up". */
export async function nextFollowUps(db: SupabaseClient<Database>, leadIds: string[]): Promise<Map<string, { id: string; title: string; dueDate: string | null }>> {
  const out = new Map<string, { id: string; title: string; dueDate: string | null }>();
  if (!leadIds.length) return out;
  const { data } = await db
    .from("work_tasks")
    .select("id, title, due_date, link_id, status")
    .eq("link_type", "lead")
    .in("link_id", leadIds)
    .not("status", "in", "(done,cancelled)")
    .order("due_date", { ascending: true, nullsFirst: false });
  for (const t of data || []) {
    if (t.link_id && !out.has(t.link_id)) out.set(t.link_id, { id: t.id, title: t.title, dueDate: t.due_date });
  }
  return out;
}

// ── Summary for the Today screen and dashboard cards ──────────────────────

export interface TargetsSummary {
  today: string;
  /** "all" when the viewer sees everyone's work, else "mine". */
  scope: "all" | "mine";
  targets: TargetWithProgress[];
  tasksDueToday: TaskDto[];
  tasksOverdue: TaskDto[];
  openTaskCount: number;
  openLeads: number;
  openLeadValue: number;
  likelyValue: number;
  wonThisMonth: { count: number; value: number };
  targetsAtRisk: number;
  overdueTaskCount: number;
}

export async function buildSummary(ctx: TargetsCtx, today: string): Promise<TargetsSummary> {
  const { db } = ctx;
  const month = monthRange(today);

  const [taskRes, leadRows, allTargets] = await Promise.all([
    db.from("work_tasks").select("*").not("status", "in", "(done,cancelled)").limit(2000),
    fetchLeadRows(db),
    loadTargetsWithProgress(ctx, today),
  ]);

  const tasks = (taskRes.data || []).map(mapTaskRow).filter((t) => taskVisible(t, ctx));
  const buckets = bucketTasks(tasks, today);
  const leads = leadRows.filter((l) => leadVisible(l, ctx));

  const open = leads.filter((l) => (OPEN_STAGES as readonly string[]).includes(l.stage));
  const wonThisMonth = leads.filter((l) => l.stage === "won" && (dateOf(l.won_at) || "") >= month.start && (dateOf(l.won_at) || "") <= month.end);

  // "My targets" for a person = the ones they're assigned to (shop-wide ones count for everyone).
  const targets = ctx.seesAll ? allTargets : allTargets.filter((t) => t.scope === "shop" || (ctx.employeeId && t.assigneeIds.includes(ctx.employeeId)));
  const active = targets.filter((t) => ["on_track", "at_risk"].includes(t.progress.status));

  return {
    today,
    scope: ctx.seesAll ? "all" : "mine",
    targets,
    tasksDueToday: buckets.dueToday,
    tasksOverdue: buckets.overdue,
    openTaskCount: tasks.length,
    openLeads: open.length,
    openLeadValue: open.reduce((s, l) => s + (Number(l.expected_value) || 0), 0),
    likelyValue: open.filter((l) => l.likely_to_close).reduce((s, l) => s + (Number(l.expected_value) || 0), 0),
    wonThisMonth: { count: wonThisMonth.length, value: wonThisMonth.reduce((s, l) => s + (Number(l.won_value) || 0), 0) },
    targetsAtRisk: active.filter((t) => t.progress.status === "at_risk").length,
    overdueTaskCount: tasks.filter((t) => isOverdue(t, today)).length,
  };
}

export { mapActivityRow, mapLeadRow, mapTargetRow, mapTaskRow };
