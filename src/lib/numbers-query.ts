import { istDateString } from "@/lib/ist-date";

/**
 * "Ask your numbers": the AI only turns a question into one of these structured queries; the shop's own data is then summed
 * here, so every figure is calculated, never guessed. Pure — the route fetches the rows.
 */

export const NUMBER_METRICS = ["revenue", "orders", "collected", "expenses", "outstanding"] as const;
export type NumberMetric = (typeof NUMBER_METRICS)[number];
export const NUMBER_GROUPS = ["none", "month", "garment", "customer", "category"] as const;
export type NumberGroup = (typeof NUMBER_GROUPS)[number];

export interface NumbersSpec {
  metric: NumberMetric;
  groupBy: NumberGroup;
  from: string;
  to: string;
  garment?: string;
  customer?: string;
}

export interface NumbersAnswer {
  metric: NumberMetric;
  unit: "money" | "count";
  total: number;
  rows: { label: string; value: number }[];
  from: string;
  to: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Validates whatever the AI returned. Returns an error message when the question can't be answered from the data. */
export function cleanNumbersSpec(raw: unknown, today = istDateString()): { spec: NumbersSpec } | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (typeof r.unsupported === "string" && r.unsupported.trim()) return { error: r.unsupported.trim().slice(0, 200) };
  const metric = NUMBER_METRICS.find((m) => m === r.metric);
  if (!metric) return { error: "I can answer questions about sales, orders, money collected, expenses and money still owed." };
  let groupBy = (NUMBER_GROUPS.find((g) => g === r.groupBy) ?? "none") as NumberGroup;
  // Only breakdowns the data really supports.
  const allowed: Record<NumberMetric, NumberGroup[]> = {
    revenue: ["none", "month", "garment", "customer"],
    orders: ["none", "month", "garment", "customer"],
    outstanding: ["none", "customer", "month"],
    collected: ["none", "month"],
    expenses: ["none", "month", "category"],
  };
  if (!allowed[metric].includes(groupBy)) groupBy = "none";
  let from = typeof r.from === "string" && ISO.test(r.from) ? r.from : `${today.slice(0, 7)}-01`;
  let to = typeof r.to === "string" && ISO.test(r.to) ? r.to : today;
  if (from > to) [from, to] = [to, from];
  const garment = lower(r.garment);
  const customer = lower(r.customer);
  return { spec: { metric, groupBy, from, to, ...(garment ? { garment } : {}), ...(customer ? { customer } : {}) } };
}

export interface OrderRow {
  name: string;
  in_date: string;
  total: number;
  balance: number;
  garments: unknown;
}

const garmentsOf = (g: unknown): { type: string; amount: number }[] =>
  Array.isArray(g) ? g.map((x) => ({ type: String((x as { type?: string })?.type ?? "").trim(), amount: Number((x as { amount?: number })?.amount) || 0 })).filter((x) => x.type) : [];

function bump(map: Map<string, number>, key: string, by: number) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function finish(spec: NumbersSpec, unit: NumbersAnswer["unit"], map: Map<string, number>, total: number): NumbersAnswer {
  const rows = [...map].map(([label, value]) => ({ label, value }));
  rows.sort((a, b) => (spec.groupBy === "month" ? a.label.localeCompare(b.label) : b.value - a.value));
  return { metric: spec.metric, unit, total, rows: rows.slice(0, 12), from: spec.from, to: spec.to };
}

/** revenue / orders / outstanding, from stitching orders already limited to the date range. */
export function aggregateOrders(orders: OrderRow[], spec: NumbersSpec): NumbersAnswer {
  const map = new Map<string, number>();
  let total = 0;
  const byGarment = spec.groupBy === "garment" || !!spec.garment;
  for (const o of orders) {
    if (o.in_date < spec.from || o.in_date > spec.to) continue;
    if (spec.customer && !lower(o.name).includes(spec.customer)) continue;
    const key = spec.groupBy === "month" ? o.in_date.slice(0, 7) : spec.groupBy === "customer" ? o.name.trim() || "Unknown" : "All";
    if (spec.metric === "outstanding") {
      const v = Number(o.balance) || 0;
      if (v <= 0) continue;
      total += v;
      bump(map, key, v);
      continue;
    }
    if (byGarment) {
      for (const g of garmentsOf(o.garments)) {
        if (spec.garment && !lower(g.type).includes(spec.garment)) continue;
        const v = spec.metric === "revenue" ? g.amount : 1;
        total += v;
        bump(map, spec.groupBy === "garment" ? g.type : key, v);
      }
      continue;
    }
    const v = spec.metric === "revenue" ? Number(o.total) || 0 : 1;
    total += v;
    bump(map, key, v);
  }
  if (spec.groupBy === "none") map.clear();
  return finish(spec, spec.metric === "orders" ? "count" : "money", map, total);
}

/** collected / expenses: dated amounts, grouped by month or (expenses) category. */
export function aggregateAmounts(rows: { date: string; amount: number; category?: string }[], spec: NumbersSpec): NumbersAnswer {
  const map = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    if (r.date < spec.from || r.date > spec.to) continue;
    const v = Number(r.amount) || 0;
    total += v;
    if (spec.groupBy === "month") bump(map, r.date.slice(0, 7), v);
    else if (spec.groupBy === "category") bump(map, r.category || "Other", v);
  }
  return finish(spec, "money", map, total);
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const TITLES: Record<NumberMetric, string> = { revenue: "Sales (stitching orders)", orders: "Orders", collected: "Money collected", expenses: "Expenses", outstanding: "Still to collect" };

export function describeAnswer(a: NumbersAnswer, spec: NumbersSpec): { headline: string; rows: { label: string; text: string }[]; note: string } {
  const fmt = (n: number) => (a.unit === "money" ? inr(n) : String(n));
  const what = [spec.garment, spec.customer && `for ${spec.customer}`].filter(Boolean).join(" ");
  return {
    headline: `${TITLES[a.metric]}${what ? ` — ${what}` : ""}: ${fmt(a.total)}`,
    rows: a.rows.map((r) => ({ label: spec.groupBy === "month" ? monthLabel(r.label) : r.label, text: fmt(r.value) })),
    note: `${dayLabel(a.from)} to ${dayLabel(a.to)}. Calculated from your records.`,
  };
}
