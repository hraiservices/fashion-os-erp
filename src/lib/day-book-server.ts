import { istDateString, istDayBoundsUtc } from "@/lib/ist-date";
import { STAGE_META } from "@/lib/business-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  LARGE_EXPENSE_THRESHOLD,
  emptySplit,
  normalizeMethod,
  type CashPosition,
  type ComparisonTotals,
  type DayClosing,
  type DeliveryBoard,
  type DeliveryItem,
  type MethodSplit,
  type RangeDay,
  type ReviewFlag,
} from "@/lib/day-book-extras";
import type { DayBookEntry } from "@/lib/day-book";
import type { CashAdjustment, ClosingHistory, Collections } from "@/lib/day-book-insights";

/**
 * Every function here takes the client as `db: SupabaseClient<Database>` and must be handed the
 * SERVICE-ROLE client (createServiceClient()) by a caller that has already checked permissions —
 * these read tables (payments, expenses, orders…) that are read-locked for the caller's own
 * session, so a cookie client would silently return partial data.
 */

const sum = (rows: { [k: string]: unknown }[] | null | undefined, key: string) =>
  (rows || []).reduce((s, r) => s + (Number(r[key]) || 0), 0);

/** Same date basis and formulas as the main Day Book route's totals, minus the entry building. */
export async function quickTotals(db: SupabaseClient<Database>, date: string): Promise<ComparisonTotals> {
  const { startUtc, endUtc } = istDayBoundsUtc(date);
  const [inv, pay, opay, exp, bills, cn, vc, orders] = await Promise.all([
    db.from("sales_invoices").select("total, doc_status").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("sales_payments").select("amount").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("order_payments").select("amount").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("expenses").select("amount").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("purchase_bills").select("total").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("sales_credit_notes").select("total").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("vendor_credits").select("total").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("orders").select("total").gte("created_at", startUtc).lt("created_at", endUtc),
  ]);
  const sales = sum((inv.data || []).filter((i) => i.doc_status !== "draft"), "total");
  return {
    sales,
    payments: sum(pay.data, "amount") + sum(opay.data, "amount"),
    expenses: sum(exp.data, "amount"),
    purchases: sum(bills.data, "total"),
    refunds: sum(cn.data, "total") + sum(vc.data, "total"),
    totalBilled: sales + sum(orders.data, "total"),
  };
}

function mapClosing(r: {
  close_date: string;
  opening_cash: number;
  expected_cash: number;
  counted_cash: number;
  variance: number;
  note: string;
  closed_by: string | null;
  closed_at: string;
}): DayClosing {
  return {
    closeDate: r.close_date,
    openingCash: Number(r.opening_cash),
    expectedCash: Number(r.expected_cash),
    countedCash: Number(r.counted_cash),
    variance: Number(r.variance),
    note: r.note || "",
    closedBy: r.closed_by,
    closedAt: r.closed_at,
  };
}

export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mapAdjustment(r: { id: string; adj_date: string; kind: string; amount: number; reason: string; note: string; created_by: string | null; created_at: string }): CashAdjustment {
  return {
    id: r.id,
    date: r.adj_date,
    kind: r.kind === "in" ? "in" : "out",
    amount: Number(r.amount),
    reason: r.reason,
    note: r.note || "",
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/**
 * Payment-method split of money collected that day, plus the cash drawer position.
 * Cash in = cash taken against retail invoices and stitching orders + manual "cash in"
 * adjustments. Cash out = cash expenses, cash vendor payments, salary advances (handed over by
 * hand) + manual "cash out" adjustments (bank deposits, owner withdrawals, salary paid in cash).
 * Payslips themselves carry no payment method, so cash salary is recorded as an adjustment.
 * Opening cash is the most recent earlier day's counted cash (0 if never closed).
 */
export async function computeCashAndMethods(
  db: SupabaseClient<Database>,
  date: string
): Promise<{ split: MethodSplit; cash: CashPosition; closing: DayClosing | null; adjustments: CashAdjustment[] }> {
  const { startUtc, endUtc } = istDayBoundsUtc(date);
  const [pay, opay, exp, vpay, adv, adj, prevClose, thisClose] = await Promise.all([
    db.from("sales_payments").select("amount, method").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("order_payments").select("amount, method").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("expenses").select("amount, pay_method").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("vendor_payments").select("amount, method").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("employee_advances").select("amount").gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("day_book_cash_adjustments").select("*").eq("adj_date", date).order("created_at"),
    db.from("day_book_closings").select("close_date, counted_cash").lt("close_date", date).order("close_date", { ascending: false }).limit(1).maybeSingle(),
    db.from("day_book_closings").select("*").eq("close_date", date).maybeSingle(),
  ]);

  const split = emptySplit();
  for (const p of [...(pay.data || []), ...(opay.data || [])]) split[normalizeMethod(p.method)] += p.amount || 0;

  const adjustments = (adj.data || []).map(mapAdjustment);
  const adjustmentsIn = adjustments.filter((a) => a.kind === "in").reduce((s, a) => s + a.amount, 0);
  const adjustmentsOut = adjustments.filter((a) => a.kind === "out").reduce((s, a) => s + a.amount, 0);
  const expenses = (exp.data || []).filter((e) => normalizeMethod(e.pay_method) === "cash").reduce((s, e) => s + (e.amount || 0), 0);
  const vendorPayments = (vpay.data || []).filter((v) => normalizeMethod(v.method) === "cash").reduce((s, v) => s + (v.amount || 0), 0);
  const advances = (adv.data || []).reduce((s, a) => s + (a.amount || 0), 0);

  const cashIn = split.cash + adjustmentsIn;
  const cashOut = expenses + vendorPayments + advances + adjustmentsOut;
  const opening = prevClose.data ? Number(prevClose.data.counted_cash) : 0;

  return {
    split,
    cash: {
      opening,
      cashIn,
      cashOut,
      breakdown: { receipts: split.cash, adjustmentsIn, expenses, vendorPayments, advances, adjustmentsOut },
      expected: opening + cashIn - cashOut,
      openingFromDate: prevClose.data?.close_date ?? null,
    },
    closing: thisClose.data ? mapClosing(thisClose.data) : null,
    adjustments,
  };
}

export async function isDayClosed(db: SupabaseClient<Database>, date: string): Promise<boolean> {
  const { data } = await db.from("day_book_closings").select("close_date").eq("close_date", date).maybeSingle();
  return !!data;
}

const NOT_DONE = "(delivered,payment)";

function toItem(o: { id: string; name: string; mobile: string; total: number; balance: number; status: string; delivery_date: string }): DeliveryItem {
  return {
    orderId: o.id,
    customerName: o.name,
    mobile: o.mobile,
    deliveryDate: o.delivery_date,
    total: o.total,
    balance: o.balance,
    status: o.status === "trial" ? "ready" : o.status,
  };
}

const DELIVERED_MARKER = `→ ${STAGE_META.delivered.label} for`;

/** Orders due, overdue and delivered on a date. `stageChangeRows` are the day's order
 *  activity_log rows the route already fetched (delivery has no timestamp column of its own). */
export async function buildDeliveryBoard(
  db: SupabaseClient<Database>,
  date: string,
  stageChangeRows: { order_id: string | null; action: string }[]
): Promise<DeliveryBoard> {
  const isToday = date === istDateString();
  const deliveredIds = Array.from(
    new Set(stageChangeRows.filter((r) => r.order_id && r.action.includes("Stage changed") && r.action.includes(DELIVERED_MARKER)).map((r) => r.order_id as string))
  );
  const cols = "id, name, mobile, total, balance, status, delivery_date";
  const [due, overdue, delivered] = await Promise.all([
    db.from("orders").select(cols).eq("delivery_date", date).not("status", "in", NOT_DONE).order("created_at"),
    isToday
      ? db.from("orders").select(cols).lt("delivery_date", date).not("status", "in", NOT_DONE).order("delivery_date").limit(50)
      : Promise.resolve({ data: [] as never[], error: null }),
    deliveredIds.length ? db.from("orders").select(cols).in("id", deliveredIds) : Promise.resolve({ data: [] as never[], error: null }),
  ]);
  const deliveredToday = (delivered.data || []).map(toItem);
  return {
    dueToday: (due.data || []).map(toItem),
    overdue: (overdue.data || []).map(toItem),
    deliveredToday,
    unpaidOnDeliveredToday: deliveredToday.reduce((s, o) => s + Math.max(0, o.balance || 0), 0),
  };
}

/** Things worth a second look: deletions/reversals, refunds, big or backdated expenses, cash
 *  variance, and anything logged after the day was closed. */
export function buildReviewFlags(input: {
  date: string;
  activityRows: { id: number; action: string; order_id: string | null; user_name: string | null; user_email: string | null }[];
  creditNotes: { id: string; credit_number: string; total: number }[];
  vendorCredits: { id: string; credit_number: string; total: number }[];
  expenses: { id: string; category: string; description: string; amount: number; date: string; created_at: string }[];
  closing: DayClosing | null;
  entries: DayBookEntry[];
}): ReviewFlag[] {
  const flags: ReviewFlag[] = [];

  for (const r of input.activityRows) {
    if (/(deleted|removed|reversed|cancelled|voided)/i.test(r.action) && !/referral bonus/i.test(r.action)) {
      flags.push({
        id: `del-${r.id}`,
        severity: "warn",
        title: "Deleted / reversed",
        detail: `${r.action} — ${r.user_name || r.user_email || "unknown"}`,
        href: r.order_id && !/deleted/i.test(r.action) ? `/orders/${r.order_id}` : undefined,
      });
    }
  }
  for (const c of input.creditNotes) {
    flags.push({ id: `cn-${c.id}`, severity: "info", title: "Sales credit note", detail: c.credit_number, amount: c.total });
  }
  for (const c of input.vendorCredits) {
    flags.push({ id: `vc-${c.id}`, severity: "info", title: "Vendor credit", detail: c.credit_number, amount: c.total });
  }
  for (const e of input.expenses) {
    if (e.amount >= LARGE_EXPENSE_THRESHOLD) {
      flags.push({ id: `bigexp-${e.id}`, severity: "warn", title: "Large expense", detail: `${e.category}${e.description ? ` — ${e.description}` : ""}`, amount: e.amount, href: "/expenses" });
    }
    if (e.date && e.date !== istDateString(new Date(e.created_at))) {
      flags.push({ id: `back-${e.id}`, severity: "info", title: "Backdated expense", detail: `${e.category} dated ${e.date}`, amount: e.amount, href: "/expenses" });
    }
  }
  if (input.closing) {
    if (input.closing.variance !== 0) {
      flags.push({
        id: "variance",
        severity: "warn",
        title: input.closing.variance > 0 ? "Cash over" : "Cash short",
        detail: `Counted ${input.closing.countedCash} vs expected ${input.closing.expectedCash}${input.closing.note ? ` — "${input.closing.note}"` : ""}`,
        amount: Math.abs(input.closing.variance),
      });
    }
    const closedAt = input.closing.closedAt;
    const late = input.entries.filter((e) => e.time > closedAt && e.module !== "attendance");
    if (late.length) {
      flags.push({
        id: "after-close",
        severity: "warn",
        title: `${late.length} ${late.length === 1 ? "entry" : "entries"} added after the day was closed`,
        detail: late.slice(0, 3).map((e) => e.activity).join(", ") + (late.length > 3 ? "…" : ""),
      });
    }
  }
  return flags;
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

/** Per-day totals across a date range (inclusive), bucketed by IST calendar day. */
export async function rangeTotals(db: SupabaseClient<Database>, from: string, to: string): Promise<RangeDay[]> {
  const startUtc = istDayBoundsUtc(from).startUtc;
  const endUtc = istDayBoundsUtc(to).endUtc;
  const win = <Q extends { gte: (c: string, v: string) => Q; lt: (c: string, v: string) => Q }>(q: Q) => q.gte("created_at", startUtc).lt("created_at", endUtc);

  const [inv, pay, opay, exp, bills, cn, vc, orders] = await Promise.all([
    fetchAll((a, b) => win(db.from("sales_invoices").select("total, doc_status, created_at")).range(a, b)),
    fetchAll((a, b) => win(db.from("sales_payments").select("amount, method, created_at")).range(a, b)),
    fetchAll((a, b) => win(db.from("order_payments").select("amount, method, created_at")).range(a, b)),
    fetchAll((a, b) => win(db.from("expenses").select("amount, created_at")).range(a, b)),
    fetchAll((a, b) => win(db.from("purchase_bills").select("total, created_at")).range(a, b)),
    fetchAll((a, b) => win(db.from("sales_credit_notes").select("total, created_at")).range(a, b)),
    fetchAll((a, b) => win(db.from("vendor_credits").select("total, created_at")).range(a, b)),
    fetchAll((a, b) => win(db.from("orders").select("total, created_at")).range(a, b)),
  ]);

  const days = new Map<string, RangeDay>();
  const day = (iso: string) => {
    const d = istDateString(new Date(iso));
    let row = days.get(d);
    if (!row) days.set(d, (row = { date: d, sales: 0, payments: 0, expenses: 0, purchases: 0, refunds: 0, totalBilled: 0, cashIn: 0 }));
    return row;
  };
  for (const i of inv) if (i.doc_status !== "draft") { const r = day(i.created_at); r.sales += i.total; r.totalBilled += i.total; }
  for (const o of orders) day(o.created_at).totalBilled += o.total;
  for (const p of [...pay, ...opay]) {
    const r = day(p.created_at);
    r.payments += p.amount;
    if (normalizeMethod(p.method) === "cash") r.cashIn += p.amount;
  }
  for (const e of exp) day(e.created_at).expenses += e.amount;
  for (const b of bills) day(b.created_at).purchases += b.total;
  for (const c of [...cn, ...vc]) day(c.created_at).refunds += c.total;

  // Fill gaps so quiet days still show as ₹0 rows in the chart.
  const out: RangeDay[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  for (; cur <= last; cur.setUTCDate(cur.getUTCDate() + 1)) {
    const d = cur.toISOString().slice(0, 10);
    out.push(days.get(d) || { date: d, sales: 0, payments: 0, expenses: 0, purchases: 0, refunds: 0, totalBilled: 0, cashIn: 0 });
  }
  return out;
}

/** Orders with money still owed whose delivery date has arrived (due on or before `date`) —
 *  the "chase these today" list. Oldest first; the total covers up to 200 such orders. */
export async function buildCollections(db: SupabaseClient<Database>, date: string): Promise<Collections> {
  const { data } = await db
    .from("orders")
    .select("id, name, mobile, balance, status, delivery_date")
    .gt("balance", 0)
    .lte("delivery_date", date)
    .order("delivery_date")
    .limit(200);
  const rows = data || [];
  return {
    items: rows.slice(0, 15).map((o) => ({
      orderId: o.id,
      customerName: o.name,
      mobile: o.mobile,
      deliveryDate: o.delivery_date,
      balance: o.balance,
      status: o.status === "trial" ? "ready" : o.status,
    })),
    totalDue: rows.reduce((s, o) => s + (o.balance || 0), 0),
    count: rows.length,
  };
}

/** Last 30 days of cash-close results, plus days that had money activity but were never closed. */
export async function getClosingHistory(db: SupabaseClient<Database>, today: string): Promise<ClosingHistory> {
  const from = shiftDays(today, -29);
  const yesterday = shiftDays(today, -1);
  const [closingsRes, days] = await Promise.all([
    db.from("day_book_closings").select("close_date, expected_cash, counted_cash, variance, closed_by").gte("close_date", from).order("close_date"),
    rangeTotals(db, from, yesterday),
  ]);
  const closings = (closingsRes.data || []).map((c) => ({
    date: c.close_date,
    expected: Number(c.expected_cash),
    counted: Number(c.counted_cash),
    variance: Number(c.variance),
    closedBy: c.closed_by,
  }));
  const closedSet = new Set(closings.map((c) => c.date));
  const unclosedDays = days
    .filter((d) => !closedSet.has(d.date) && (d.totalBilled > 0 || d.payments > 0 || d.expenses > 0 || d.purchases > 0))
    .map((d) => d.date);
  return { closings, unclosedDays };
}

/** Everything buildEndOfDaySummary needs for a date, without building the full timeline —
 *  used by the evening cron so it doesn't repeat the whole Day Book route. */
export async function buildSummaryInput(db: SupabaseClient<Database>, date: string) {
  const { startUtc, endUtc } = istDayBoundsUtc(date);
  const [totals, cashAndMethods, ordersCount, stageRows] = await Promise.all([
    quickTotals(db, date),
    computeCashAndMethods(db, date),
    db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startUtc).lt("created_at", endUtc),
    db.from("activity_log").select("order_id, action").not("order_id", "is", null).gte("created_at", startUtc).lt("created_at", endUtc),
  ]);
  const deliveries = await buildDeliveryBoard(db, date, stageRows.data || []);
  return {
    date,
    sales: totals.sales,
    stitchingBilled: totals.totalBilled - totals.sales,
    payments: totals.payments,
    expenses: totals.expenses,
    purchases: totals.purchases,
    split: cashAndMethods.split,
    cash: cashAndMethods.cash,
    closing: cashAndMethods.closing,
    ordersCreated: ordersCount.count || 0,
    deliveredToday: deliveries.deliveredToday.length,
    dueToday: deliveries.dueToday.length,
    overdue: deliveries.overdue.length,
    unpaidOnDelivered: deliveries.unpaidOnDeliveredToday,
  };
}
