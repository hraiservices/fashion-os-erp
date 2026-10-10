import { inr } from "@/lib/format";
import { isOpenStage } from "@/lib/lead-stages";

/**
 * Sales Targets engine — pure functions (no database, no React), so every rule here is
 * unit-tested. The API routes turn real orders / invoices / leads into the plain "fact" shapes
 * below, and everything else (progress, pace, status, forecast, leaderboard) is computed here.
 *
 * Counting rules, kept deliberately simple so a number can always be explained:
 *  - "Sales ₹", "Orders" and "Pieces" count real orders and invoices only, so they match the books.
 *  - An invoice is credited to its `sales_person_id`; an order is credited to the owner of the lead
 *    it was created from. A shop-wide target counts everything, credited or not.
 *  - "New customers won" counts leads marked Won (in the date range, owned by the assignees).
 *  - A product filter applies per kind of sale: product ids filter invoice lines, garment types
 *    filter order garments. If only one kind of filter is set, the other kind contributes nothing.
 */

export const TARGET_METRICS = ["sales_value", "order_count", "units", "leads_won"] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export const METRIC_LABELS: Record<TargetMetric, string> = {
  sales_value: "Sales ₹",
  order_count: "Number of orders / invoices",
  units: "Pieces of chosen products",
  leads_won: "New customers won",
};

export type TargetScope = "shop" | "person";
export type TargetOverride = "draft" | "cancelled" | null;
export type TargetStatus = "draft" | "cancelled" | "upcoming" | "on_track" | "at_risk" | "achieved" | "missed";

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  draft: "Draft",
  cancelled: "Cancelled",
  upcoming: "Starts soon",
  on_track: "On track",
  at_risk: "Behind pace",
  achieved: "Achieved",
  missed: "Missed",
};

export interface TargetDef {
  id: string;
  title: string;
  metric: TargetMetric;
  targetValue: number;
  /** YYYY-MM-DD, shop-local (IST) dates, inclusive. */
  startDate: string;
  endDate: string;
  scope: TargetScope;
  assigneeIds: string[];
  productIds: string[];
  garmentTypes: string[];
  statusOverride: TargetOverride;
}

export interface SaleLine {
  productId?: string | null;
  garmentType?: string | null;
  qty: number;
  amount: number;
}

/** One order or invoice, already resolved to the person credited with it (or null). */
export interface SaleFact {
  kind: "order" | "invoice";
  id: string;
  /** YYYY-MM-DD, shop-local date the sale was made. */
  date: string;
  personId: string | null;
  value: number;
  lines: SaleLine[];
}

export interface LeadFact {
  id: string;
  stage: string;
  assignedEmployeeId: string | null;
  expectedValue: number;
  likelyToClose: boolean;
  wonValue: number;
  /** YYYY-MM-DD the lead was marked Won, if it was. */
  wonDate: string | null;
  source?: string;
  createdDate?: string;
  lostReason?: string;
  lostDate?: string | null;
}

export interface PersonCredit {
  personId: string | null;
  value: number;
}

export interface TargetProgress {
  achieved: number;
  target: number;
  /** achieved ÷ target × 100, NOT clamped (a 120% result is real); clamp in the UI for bars. */
  pct: number;
  remaining: number;
  status: TargetStatus;
  daysTotal: number;
  daysElapsed: number;
  daysLeft: number;
  /** Where the person should be by now, based on COMPLETED days (today is still in progress). */
  expected: number;
  /** Linear projection of the final figure at the current pace. */
  projected: number;
  /** Open leads starred "Likely to close" — ₹ for sales targets, a count for leads-won targets. */
  likely: number;
  /** achieved + likely. */
  forecast: number;
  byPerson: PersonCredit[];
}

const MS_DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_DAY);
export const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);

/** Behind pace = under this fraction of where the pro-rata line says you should be. */
export const ON_TRACK_RATIO = 0.9;

const lower = (s: string) => s.trim().toLowerCase();

function hasFilters(t: Pick<TargetDef, "productIds" | "garmentTypes">) {
  return t.productIds.length > 0 || t.garmentTypes.length > 0;
}

function lineMatches(kind: SaleFact["kind"], line: SaleLine, t: TargetDef): boolean {
  if (!hasFilters(t)) return true;
  if (kind === "invoice") return t.productIds.length > 0 && !!line.productId && t.productIds.includes(line.productId);
  const types = t.garmentTypes.map(lower);
  return types.length > 0 && !!line.garmentType && types.includes(lower(line.garmentType));
}

function inWindow(date: string | null | undefined, t: Pick<TargetDef, "startDate" | "endDate">): boolean {
  return !!date && date >= t.startDate && date <= t.endDate;
}

function creditedToScope(personId: string | null, t: TargetDef): boolean {
  if (t.scope === "shop") return true;
  return !!personId && t.assigneeIds.includes(personId);
}

/** How much one sale adds to a sales/orders/units target (0 if it doesn't count). */
export function saleContribution(sale: SaleFact, t: TargetDef): number {
  if (t.metric === "leads_won") return 0;
  if (!inWindow(sale.date, t) || !creditedToScope(sale.personId, t)) return 0;
  const filtered = hasFilters(t);
  const matching = sale.lines.filter((l) => lineMatches(sale.kind, l, t));
  switch (t.metric) {
    case "sales_value":
      return filtered ? matching.reduce((s, l) => s + (l.amount || 0), 0) : sale.value || 0;
    case "units":
      return matching.reduce((s, l) => s + (l.qty || 0), 0);
    case "order_count":
      return !filtered || matching.length > 0 ? 1 : 0;
    default:
      return 0;
  }
}

function leadInScope(lead: LeadFact, t: TargetDef): boolean {
  return creditedToScope(lead.assignedEmployeeId, t);
}

export function computeProgress(t: TargetDef, sales: SaleFact[], leads: LeadFact[], today: string): TargetProgress {
  const byPersonMap = new Map<string | null, number>();
  let achieved = 0;

  if (t.metric === "leads_won") {
    for (const l of leads) {
      if (l.stage !== "won" || !inWindow(l.wonDate, t) || !leadInScope(l, t)) continue;
      achieved += 1;
      byPersonMap.set(l.assignedEmployeeId, (byPersonMap.get(l.assignedEmployeeId) || 0) + 1);
    }
  } else {
    for (const s of sales) {
      const c = saleContribution(s, t);
      if (!c) continue;
      achieved += c;
      byPersonMap.set(s.personId, (byPersonMap.get(s.personId) || 0) + c);
    }
  }

  let likely = 0;
  if (t.metric === "sales_value" || t.metric === "leads_won") {
    for (const l of leads) {
      if (!isOpenStage(l.stage) || !l.likelyToClose || !leadInScope(l, t)) continue;
      likely += t.metric === "leads_won" ? 1 : l.expectedValue || 0;
    }
  }

  const daysTotal = Math.max(1, daysBetween(t.startDate, t.endDate) + 1);
  const rawElapsed = daysBetween(t.startDate, today) + 1;
  const daysElapsed = Math.min(daysTotal, Math.max(0, rawElapsed));
  const completed = Math.min(daysTotal, Math.max(0, rawElapsed - 1));
  const daysLeft = Math.max(0, daysBetween(today, t.endDate));
  const expected = t.targetValue * (completed / daysTotal);
  const projected = daysElapsed > 0 ? (achieved / daysElapsed) * daysTotal : 0;

  let status: TargetStatus;
  if (t.statusOverride) status = t.statusOverride;
  else if (today < t.startDate) status = "upcoming";
  else if (achieved >= t.targetValue) status = "achieved";
  else if (today > t.endDate) status = "missed";
  else status = achieved >= ON_TRACK_RATIO * expected ? "on_track" : "at_risk";

  return {
    achieved,
    target: t.targetValue,
    pct: t.targetValue > 0 ? (achieved / t.targetValue) * 100 : 0,
    remaining: Math.max(0, t.targetValue - achieved),
    status,
    daysTotal,
    daysElapsed,
    daysLeft,
    expected,
    projected,
    likely,
    forecast: achieved + likely,
    byPerson: Array.from(byPersonMap, ([personId, value]) => ({ personId, value })).sort((a, b) => b.value - a.value),
  };
}

// ── Formatting (plain words) ──────────────────────────────────────────────

export function formatMetricValue(metric: TargetMetric, value: number): string {
  return metric === "sales_value" ? inr(value) : Math.round(value || 0).toLocaleString("en-IN");
}

/** "₹60,000 of ₹1,00,000" and "8 days left · behind pace" — a target read as a sentence. */
export function describeTarget(metric: TargetMetric, p: TargetProgress): { headline: string; detail: string } {
  const headline = `${formatMetricValue(metric, p.achieved)} of ${formatMetricValue(metric, p.target)}`;
  let detail: string;
  switch (p.status) {
    case "upcoming":
      detail = "not started yet";
      break;
    case "achieved":
      detail = "target reached";
      break;
    case "missed":
      detail = `ended ${formatMetricValue(metric, p.remaining)} short`;
      break;
    case "draft":
    case "cancelled":
      detail = TARGET_STATUS_LABELS[p.status].toLowerCase();
      break;
    default:
      detail = `${p.daysLeft} ${p.daysLeft === 1 ? "day" : "days"} left · ${p.status === "on_track" ? "on track" : "behind pace"}`;
  }
  return { headline, detail };
}

/** First and last day of the month containing `today` — the default period for a new target. */
export function monthRange(today: string): { start: string; end: string } {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/**
 * The Day Book's daily billed target, taken from Targets: the shop-wide "Sales ₹" target that
 * covers `date` (no product or garment filter, not a draft or cancelled), spread evenly over its
 * days. When several qualify, the one that started most recently wins. Null when none applies,
 * so the Day Book falls back to its own manual target.
 */
export function dailyTargetFor(
  targets: Pick<TargetDef, "title" | "metric" | "targetValue" | "startDate" | "endDate" | "scope" | "productIds" | "garmentTypes" | "statusOverride">[],
  date: string
): { value: number; title: string } | null {
  const match = targets
    .filter((t) => t.scope === "shop" && t.metric === "sales_value" && !t.statusOverride && t.productIds.length === 0 && t.garmentTypes.length === 0)
    .filter((t) => t.targetValue > 0 && t.startDate <= date && date <= t.endDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (!match) return null;
  const days = dayNum(match.endDate) - dayNum(match.startDate) + 1;
  return { value: Math.round(match.targetValue / days), title: match.title };
}

// ── Leaderboard, pipeline, sources ────────────────────────────────────────

export interface LeaderRow {
  personId: string | null;
  /** ₹ credited (orders via leads + invoices with a sales person). */
  value: number;
  /** Number of orders/invoices credited. */
  sales: number;
  leadsWon: number;
  /** ₹ entered on Won leads — shown separately from `value`, never added to it. */
  wonValue: number;
}

export function buildLeaderboard(sales: SaleFact[], leads: LeadFact[], window: { start: string; end: string }): LeaderRow[] {
  const rows = new Map<string | null, LeaderRow>();
  const row = (id: string | null) => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { personId: id, value: 0, sales: 0, leadsWon: 0, wonValue: 0 }));
    return r;
  };
  for (const s of sales) {
    if (!inWindow(s.date, { startDate: window.start, endDate: window.end })) continue;
    const r = row(s.personId);
    r.value += s.value || 0;
    r.sales += 1;
  }
  for (const l of leads) {
    if (l.stage !== "won" || !inWindow(l.wonDate, { startDate: window.start, endDate: window.end })) continue;
    const r = row(l.assignedEmployeeId);
    r.leadsWon += 1;
    r.wonValue += l.wonValue || 0;
  }
  return Array.from(rows.values()).sort((a, b) => b.value - a.value || b.leadsWon - a.leadsWon);
}

export interface PipelineRow {
  stage: string;
  count: number;
  value: number;
  likelyValue: number;
}

export function pipelineSummary(leads: LeadFact[], stageOrder: readonly string[]): { rows: PipelineRow[]; openCount: number; openValue: number; likelyValue: number } {
  const rows = stageOrder.map((stage) => {
    const inStage = leads.filter((l) => l.stage === stage);
    return {
      stage,
      count: inStage.length,
      value: inStage.reduce((s, l) => s + (l.expectedValue || 0), 0),
      likelyValue: inStage.filter((l) => l.likelyToClose).reduce((s, l) => s + (l.expectedValue || 0), 0),
    };
  });
  return {
    rows,
    openCount: rows.reduce((s, r) => s + r.count, 0),
    openValue: rows.reduce((s, r) => s + r.value, 0),
    likelyValue: rows.reduce((s, r) => s + r.likelyValue, 0),
  };
}

/** Won ÷ (Won + Lost), as a whole percent. Null when nothing has been decided yet. */
export function winRate(leads: Pick<LeadFact, "stage">[]): number | null {
  const won = leads.filter((l) => l.stage === "won").length;
  const lost = leads.filter((l) => l.stage === "lost").length;
  return won + lost === 0 ? null : Math.round((won / (won + lost)) * 100);
}

export interface SourceRow {
  source: string;
  total: number;
  won: number;
  lost: number;
  open: number;
  winRate: number | null;
  avgDaysToWin: number | null;
}

export function sourceStats(leads: LeadFact[]): SourceRow[] {
  const groups = new Map<string, LeadFact[]>();
  for (const l of leads) {
    const key = (l.source || "").trim() || "Not recorded";
    groups.set(key, [...(groups.get(key) || []), l]);
  }
  return Array.from(groups, ([source, list]) => {
    const wonLeads = list.filter((l) => l.stage === "won");
    const days = wonLeads.filter((l) => l.createdDate && l.wonDate).map((l) => Math.max(0, daysBetween(l.createdDate!, l.wonDate!)));
    return {
      source,
      total: list.length,
      won: wonLeads.length,
      lost: list.filter((l) => l.stage === "lost").length,
      open: list.filter((l) => isOpenStage(l.stage)).length,
      winRate: winRate(list),
      avgDaysToWin: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null,
    };
  }).sort((a, b) => b.total - a.total);
}

export function lostReasonStats(leads: LeadFact[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of leads) {
    if (l.stage !== "lost") continue;
    const key = (l.lostReason || "").trim() || "Not recorded";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

// ── Incentive ─────────────────────────────────────────────────────────────

/**
 * Same formula as src/lib/commission.ts (percent_of_sales / flat_per_order), but fed with the
 * sales CREDITED to the person rather than the orders they stitched.
 */
export function incentiveFor(commissionType: string, commissionRate: number, credited: { value: number; sales: number }): number {
  if (commissionType === "percent_of_sales") return (credited.value * (commissionRate || 0)) / 100;
  if (commissionType === "flat_per_order") return credited.sales * (commissionRate || 0);
  return 0;
}
