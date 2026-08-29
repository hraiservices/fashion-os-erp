// Ported from Stitching_Manager_Pro_v16.html ~lines 2373-2524 (Analytics helpers).
import { daysLeft, loyaltyDiscountOf, couponDiscountOf, loyaltyTier, DEFAULT_LOYALTY_CONFIG, type LoyaltyConfig, type TailorRateCard } from "@/lib/business-rules";
import { isOrderOutstanding } from "@/lib/balances";
import { istDateString } from "@/lib/ist-date";
import { computeOrderProfit } from "@/lib/order-profit";
import type { Order, Customer, ReferralCoupon, OrderExpense } from "@/lib/types";

function fmtMon(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function getLast6Months(): string[] {
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    // istDateString, NOT toISOString: setDate(1) keeps the current time-of-day, so between
    // 00:00 and 05:30 IST toISOString() rolls back to the last day of the PREVIOUS month and
    // every bucket key silently shifts a month (the current month vanishes from the report).
    months.push(istDateString(d).substring(0, 7));
  }
  return months;
}

export interface MonthlyStat {
  month: string;
  label: string;
  billed: number;
  collected: number;
  pending: number;
  count: number;
}

/** getMonthly(), line ~2394. */
export function getMonthly(orders: Order[]): MonthlyStat[] {
  return getLast6Months().map((month) => {
    const mo = orders.filter((o) => o.inDate?.startsWith(month));
    return {
      month,
      label: fmtMon(month),
      billed: mo.reduce((s, o) => s + (o.total || 0), 0),
      // collected = real cash received = advance (capped at total) minus loyalty discounts.
      // Clamping advance prevents an over-advance (e.g. after a price reduction edit) from
      // reporting collected > billed and pushing collectionPct above 100%.
      collected: mo.reduce((s, o) => s + Math.max(0, Math.min(o.advance || 0, o.total || 0) - loyaltyDiscountOf(o) - couponDiscountOf(o)), 0),
      // pending = authoritative stored balance when present, falling back to total - advance
      pending: mo.reduce((s, o) => s + Math.max(0, o.balance ?? Math.max(0, (o.total || 0) - (o.advance || 0))), 0),
      count: mo.length,
    };
  });
}

export interface TailorStat {
  tailor: string;
  active: number;
  done: number;
  overdue: number;
  /** Promised turnaround days (delivery_date − in_date). Not actual completion time. */
  avg: number;
  revenue: number;
  total: number;
}

/** getTailorStats(), line ~2421. */
export function getTailorStats(orders: Order[]): TailorStat[] {
  const tailors = Array.from(new Set(orders.map((o) => o.tailor).filter(Boolean)));
  return tailors
    .map((t) => {
      const tO = orders.filter((o) => o.tailor === t);
      const active = tO.filter((o) => o.status !== "delivered" && o.status !== "payment");
      const done = tO.filter((o) => o.status === "delivered" || o.status === "payment");
      const over = active.filter((o) => daysLeft(o.deliveryDate) < 0);
      const rev = tO.reduce((s, o) => s + (o.total || 0), 0);
      const avg = done.length
        ? Math.round(
            done.reduce((s, o) => {
              if (!o.inDate || !o.deliveryDate) return s;
              return s + Math.ceil((new Date(o.deliveryDate).getTime() - new Date(o.inDate).getTime()) / 86400000);
            }, 0) / done.length
          )
        : 0;
      return { tailor: t, active: active.length, done: done.length, overdue: over.length, avg, revenue: rev, total: tO.length };
    })
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);
}

export interface GarmentStat {
  type: string;
  count: number;
  rev: number;
}

/** getGarmentStats(), line ~2459. */
export function getGarmentStats(orders: Order[]): GarmentStat[] {
  const m: Record<string, { count: number; rev: number }> = {};
  orders.forEach((o) => {
    (o.garments || []).forEach((g) => {
      if (g.type) {
        m[g.type] = m[g.type] || { count: 0, rev: 0 };
        m[g.type].count += (g.no as number) || 1;
        m[g.type].rev += (g.amount as number) || 0;
      }
    });
  });
  return Object.entries(m)
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.count - a.count);
}

export interface CustomerAgg {
  name: string;
  mobile: string;
  orders: Order[];
  spent: number;
}

/** getCustMap(), line ~2484. */
export function getCustMap(orders: Order[]): CustomerAgg[] {
  const m: Record<string, CustomerAgg> = {};
  orders.forEach((o) => {
    if (!o.mobile) return; // skip orders with no mobile — prevents ghost customer
    m[o.mobile] = m[o.mobile] || { name: o.name || "", mobile: o.mobile, orders: [], spent: 0 };
    m[o.mobile].orders.push(o);
    m[o.mobile].spent += o.total || 0;
  });
  return Object.values(m);
}

export interface AgingStat {
  fresh: number;
  mod: number;
  old: number;
  fCnt: number;
  mCnt: number;
  oCnt: number;
}

export interface AgingRow extends Order {
  daysOver: number;
  agingBand: "Fresh" | "1-30 days" | "30+ days";
}

/** ReportsView's `aging` memo, line ~8023 — per-order list (vs. getAging's bucketed totals). */
export function getAgingList(orders: Order[]): AgingRow[] {
  return orders
    .filter(isOrderOutstanding)
    .map((o) => {
      const d = daysLeft(o.deliveryDate);
      return {
        ...o,
        daysOver: d < 0 ? Math.abs(d) : 0,
        agingBand: (d >= 0 ? "Fresh" : Math.abs(d) <= 30 ? "1-30 days" : "30+ days") as AgingRow["agingBand"],
      };
    })
    .sort((a, b) => b.daysOver - a.daysOver); // most overdue first
}

/** getAging(), line ~2499. */
export function getAging(orders: Order[]): AgingStat {
  const a: AgingStat = { fresh: 0, mod: 0, old: 0, fCnt: 0, mCnt: 0, oCnt: 0 };
  orders
    .filter(isOrderOutstanding)
    .forEach((o) => {
      const d = daysLeft(o.deliveryDate);
      if (d >= 0) {
        a.fresh += o.balance;
        a.fCnt++;
      } else if (Math.abs(d) <= 30) {
        a.mod += o.balance;
        a.mCnt++;
      } else {
        a.old += o.balance;
        a.oCnt++;
      }
    });
  return a;
}

export interface PaymentStat extends MonthlyStat {
  fullyPaid: number;
  partPaid: number;
  unpaid: number;
  collectionPct: number;
}

/** ReportsView's `paymentStats` memo, ~line 8049. Same months as getMonthly, oldest-first. */
export function getPaymentStats(orders: Order[]): PaymentStat[] {
  return getMonthly(orders)
    .map((m) => {
      const mo = orders.filter((o) => (o.inDate || "").startsWith(m.month));
      const fullyPaid = mo.filter((o) => (o.balance || 0) <= 0).length;
      const partPaid = mo.filter((o) => (o.advance || 0) > 0 && (o.balance || 0) > 0).length;
      const unpaid = mo.filter((o) => !(o.advance || 0)).length;
      return { ...m, fullyPaid, partPaid, unpaid, collectionPct: m.billed ? Math.round((m.collected / m.billed) * 100) : 0 };
    })
    .reverse();
}

export interface SeasonalStat {
  month: string;
  label: string;
  count: number;
  revenue: number;
  avgOrderVal: number;
  growth: number;
}

/** ReportsView's `seasonal` memo, ~line 8059 — 12 months instead of getMonthly's 6. */
export function getSeasonalTrends(orders: Order[]): SeasonalStat[] {
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    // istDateString, NOT toISOString: setDate(1) keeps the current time-of-day, so between
    // 00:00 and 05:30 IST toISOString() rolls back to the last day of the PREVIOUS month and
    // every bucket key silently shifts a month (the current month vanishes from the report).
    months.push(istDateString(d).substring(0, 7));
  }
  return months.map((m, idx) => {
    const mo = orders.filter((o) => (o.inDate || "").startsWith(m));
    const rev = mo.reduce((s, o) => s + (o.total || 0), 0);
    const prevMo = idx > 0 ? months[idx - 1] : null;
    const prevRev = prevMo ? orders.filter((o) => (o.inDate || "").startsWith(prevMo)).reduce((s, o) => s + (o.total || 0), 0) : 0;
    const growth = prevRev > 0 ? Math.round(((rev - prevRev) / prevRev) * 100) : rev > 0 ? 100 : 0;
    return { month: m, label: fmtMon(m), count: mo.length, revenue: rev, avgOrderVal: mo.length ? Math.round(rev / mo.length) : 0, growth };
  });
}

export interface ClvRow {
  name: string;
  mobile: string;
  totalOrders: number;
  totalSpent: number;
  avgOrder: number;
  monthsActive: number;
  clvScore: number;
  lastDate: string;
}

/** ReportsView's `clvData` memo, ~line 8071 — used for the "Customer Lifetime" sidebar entry. */
export function getCustomerLifetime(orders: Order[]): ClvRow[] {
  const cmap: Record<string, { name: string; mobile: string; orders: Order[]; spent: number; firstDate: string; lastDate: string }> = {};
  orders.forEach((o) => {
    if (!o.mobile) return;
    if (!cmap[o.mobile]) cmap[o.mobile] = { name: o.name, mobile: o.mobile, orders: [], spent: 0, firstDate: o.inDate, lastDate: o.inDate };
    const c = cmap[o.mobile];
    c.orders.push(o);
    c.spent += o.total || 0;
    if (o.inDate && o.inDate < c.firstDate) c.firstDate = o.inDate;
    if (o.inDate && o.inDate > c.lastDate) c.lastDate = o.inDate;
  });
  return Object.values(cmap)
    .map((c) => {
      const monthsActive = c.firstDate ? Math.max(1, Math.ceil((Date.now() - new Date(c.firstDate).getTime()) / (30.44 * 86400000))) : 1;
      const avgOrder = c.orders.length ? Math.round(c.spent / c.orders.length) : 0;
      return {
        name: c.name,
        mobile: c.mobile,
        totalOrders: c.orders.length,
        totalSpent: c.spent,
        avgOrder,
        monthsActive: Math.round(monthsActive),
        clvScore: Math.round(c.spent * (c.orders.length > 1 ? 1.5 : 1)),
        lastDate: c.lastDate,
      };
    })
    .sort((a, b) => b.clvScore - a.clvScore);
}

export interface StaffEfficiencyStat extends TailorStat {
  revPerOrder: number;
  efficiency: number;
}

/** ReportsView's `staffEff` memo, ~line 8099. */
export function getStaffEfficiency(orders: Order[]): StaffEfficiencyStat[] {
  return getTailorStats(orders)
    .map((t) => ({ ...t, revPerOrder: t.total ? Math.round(t.revenue / t.total) : 0, efficiency: t.total ? Math.round(((t.total - t.overdue) / t.total) * 100) : 100 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export type Capacity = "Low" | "Normal" | "High" | "Overloaded";

export interface WorkloadStat extends TailorStat {
  capacity: Capacity;
  capColor: string;
}

/** ReportsView's `workload` memo, ~line 8104. */
export function getTailorWorkload(orders: Order[]): WorkloadStat[] {
  return getTailorStats(orders)
    .map((t) => {
      const capacity: Capacity = t.active <= 2 ? "Low" : t.active <= 5 ? "Normal" : t.active <= 8 ? "High" : "Overloaded";
      const capColor = t.active <= 2 ? "#059669" : t.active <= 5 ? "#D97706" : t.active <= 8 ? "#EA580C" : "#DC2626";
      return { ...t, capacity, capColor };
    })
    .sort((a, b) => b.active - a.active);
}

/** Extra scheduling buffer (days) added on top of the base turnaround estimate when a tailor's
 *  queue is already deep — a Low-capacity tailor can start right away, an Overloaded one
 *  realistically needs over a week longer before they even get to a new order. */
const CAPACITY_BUFFER_DAYS: Record<Capacity, number> = { Low: 0, Normal: 1, High: 3, Overloaded: 6 };

/** A tailor needs at least this many completed orders before their own average turnaround is
 *  trusted over the shop-wide per-garment-type figures — otherwise one unusually fast/slow past
 *  order would skew every future estimate for a tailor who's still new or rarely used. */
const MIN_COMPLETED_FOR_TAILOR_AVG = 3;

/** Used only when there's neither enough of this tailor's own history nor any shop-wide
 *  history for the garment type(s) being ordered (e.g. the very first order ever, or a brand
 *  new garment type) — a generic, conservative placeholder rather than refusing to suggest
 *  anything at all. */
const DEFAULT_TURNAROUND_DAYS = 5;

export interface DeliveryEstimate {
  /** ISO yyyy-mm-dd suggested delivery date. */
  date: string;
  /** Total estimated turnaround days folded into that date (base + queue buffer + extra garments). */
  days: number;
  /** What the base turnaround figure (before queue buffer/garment-count adjustments) came from —
   *  shown in the UI so the suggestion doesn't read as an opaque black box. */
  basis: "tailor" | "garment-type" | "default";
}

/** Shop-wide average turnaround (delivery_date − in_date) per garment type, from completed
 *  orders only — the same "promised days," not actual finish time, caveat as getTailorStats.avg. */
function getGarmentTurnaroundDays(orders: Order[]): Record<string, number> {
  const byType: Record<string, { sum: number; count: number }> = {};
  for (const o of orders) {
    if (o.status !== "delivered" && o.status !== "payment") continue;
    if (!o.inDate || !o.deliveryDate) continue;
    const days = Math.ceil((new Date(o.deliveryDate).getTime() - new Date(o.inDate).getTime()) / 86400000);
    if (days <= 0) continue;
    for (const g of o.garments) {
      if (!g.type) continue;
      const bucket = (byType[g.type] ??= { sum: 0, count: 0 });
      bucket.sum += days;
      bucket.count += 1;
    }
  }
  return Object.fromEntries(Object.entries(byType).map(([type, { sum, count }]) => [type, Math.round(sum / count)]));
}

/**
 * Suggests a realistic delivery date for a NEW order — purely a suggestion the order form shows
 * as a tappable chip, never auto-applied over what someone picks. Prefers the selected tailor's
 * own historical turnaround (once they have enough completed orders to trust it), falls back to
 * the shop-wide average for the garment type(s) in this order, then a flat default. Adds a
 * queue-depth buffer from the tailor's current active-order capacity, plus one day per garment
 * beyond the first (a 5-garment order realistically takes longer than a 1-garment one).
 */
export function estimateDeliveryDate(orders: Order[], tailorId: string, garmentTypes: string[], fromDateIso: string): DeliveryEstimate {
  const tailorStats = getTailorStats(orders).find((t) => t.tailor === tailorId);
  const workload = getTailorWorkload(orders).find((w) => w.tailor === tailorId);

  let baseDays: number;
  let basis: DeliveryEstimate["basis"];
  if (tailorStats && tailorStats.done >= MIN_COMPLETED_FOR_TAILOR_AVG && tailorStats.avg > 0) {
    baseDays = tailorStats.avg;
    basis = "tailor";
  } else {
    const perType = getGarmentTurnaroundDays(orders);
    const relevant = garmentTypes.map((t) => perType[t]).filter((d): d is number => !!d);
    if (relevant.length) {
      baseDays = Math.round(relevant.reduce((s, d) => s + d, 0) / relevant.length);
      basis = "garment-type";
    } else {
      baseDays = DEFAULT_TURNAROUND_DAYS;
      basis = "default";
    }
  }

  const buffer = workload ? CAPACITY_BUFFER_DAYS[workload.capacity] : 0;
  const extraGarmentDays = Math.max(0, garmentTypes.length - 1);
  const days = Math.max(1, baseDays + buffer + extraGarmentDays);

  const from = new Date(`${fromDateIso}T00:00:00`);
  from.setDate(from.getDate() + days);
  const date = from.toISOString().slice(0, 10);

  return { date, days, basis };
}

export interface GarmentRevRow {
  label: string;
  count: number;
  revenue: number;
  isCustom: boolean;
}

/**
 * ReportsView's `customGarRev` memo, ~line 8111 — splits by `garment.customType` when present.
 * Our OrderForm doesn't currently collect a custom garment name anywhere, so every row will
 * show isCustom: false until that field exists — an honest reflection of current data, not a bug.
 */
export function getCustomGarmentRevenue(orders: Order[]): GarmentRevRow[] {
  const breakdown: Record<string, GarmentRevRow> = {};
  orders.forEach((o) => {
    (o.garments || []).forEach((g) => {
      const customType = typeof g.customType === "string" ? g.customType.trim() : "";
      const key = customType || g.type || "Other";
      const isCustom = !!customType;
      breakdown[key] = breakdown[key] || { label: key, count: 0, revenue: 0, isCustom };
      breakdown[key].count += (g.no as number) || 1;
      breakdown[key].revenue += (g.amount as number) || 0;
    });
  });
  return Object.values(breakdown).sort((a, b) => b.revenue - a.revenue);
}

/** ReportsView's `pending` memo, ~line 8042. */
export function getPendingOrders(orders: Order[]): Order[] {
  return orders
    .filter((o) => o.status !== "delivered" && o.status !== "payment")
    .sort((a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime());
}

export interface LoyaltyImpactStat {
  totalPointsOutstanding: number;
  totalPointsEverEarned: number;
  totalDiscountGiven: number;
  redeemingCustomers: number;
  totalCustomers: number;
  tierCounts: Record<string, number>;
}

/**
 * Loyalty Impact — an original construction for this rewrite (the old app's sidebar had this
 * label but no corresponding memo was found in ReportsView), built from data we already have:
 * current/lifetime points across customers, total ₹ discounted via loyalty (loyaltyDiscountOf
 * summed across every order's history), and how many customers have ever redeemed.
 */
export function getLoyaltyImpact(orders: Order[], customers: Customer[], cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): LoyaltyImpactStat {
  const totalPointsOutstanding = customers.reduce((s, c) => s + (c.loyaltyPoints || 0), 0);
  const totalPointsEverEarned = customers.reduce((s, c) => s + (c.totalEarned || 0), 0);
  const totalDiscountGiven = orders.reduce((s, o) => s + loyaltyDiscountOf(o), 0);
  const redeemingCustomers = customers.filter((c) => (c.loyaltyHistory as { type?: string }[]).some((h) => h?.type === "redeem")).length;

  const tierCounts: Record<string, number> = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
  customers.forEach((c) => {
    tierCounts[loyaltyTier(c.totalEarned, cfg).label]++;
  });

  return { totalPointsOutstanding, totalPointsEverEarned, totalDiscountGiven, redeemingCustomers, totalCustomers: customers.length, tierCounts };
}

export interface ReadyUncollectedRow extends Order {
  daysWaiting: number;
}

/** Orders sitting in "ready" the longest without being picked up (delivered) — distinct from
 *  getAgingList, which is about the delivery-date promise, not physical pickup. Orders that
 *  reached "ready" before the ready_at column existed have no timestamp to measure from and
 *  are excluded rather than shown with a misleading 0-day wait. */
export function getReadyUncollected(orders: Order[]): ReadyUncollectedRow[] {
  return orders
    .filter((o) => o.status === "ready" && o.readyAt)
    .map((o) => ({ ...o, daysWaiting: Math.max(0, Math.floor((Date.now() - new Date(o.readyAt!).getTime()) / 86400000)) }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting);
}

export interface ReworkRateRow {
  tailor: string;
  totalOrders: number;
  reworkCount: number;
  reworkRate: number;
}

/** Rework rate per tailor — feeds off the manually-set rework flag (src/lib/business-rules.ts
 *  set via the set_order_rework RPC), not an automatic quality signal. */
export function getReworkRate(orders: Order[]): ReworkRateRow[] {
  const tailors = Array.from(new Set(orders.map((o) => o.tailor).filter(Boolean)));
  return tailors
    .map((tailor) => {
      const tO = orders.filter((o) => o.tailor === tailor);
      const reworkCount = tO.filter((o) => o.reworkFlag).length;
      return { tailor, totalOrders: tO.length, reworkCount, reworkRate: tO.length ? Math.round((reworkCount / tO.length) * 100) : 0 };
    })
    .filter((r) => r.totalOrders > 0)
    .sort((a, b) => b.reworkRate - a.reworkRate);
}

export type RiskLevel = "low" | "medium" | "high";

export interface ReworkRiskEstimate {
  level: RiskLevel;
  /** % of the matching historical orders that were either flagged rework or ran overdue. */
  riskRate: number;
  sampleSize: number;
  /** "combo" = this exact tailor + garment-type pairing has enough history; "tailor" = fell
   *  back to this tailor's overall record because the specific pairing is too thin to trust. */
  basis: "combo" | "tailor";
}

/** A tailor needs at least this many matching past orders before a risk rate means anything —
 *  below this, one bad order would swing the rate wildly and just be noise. */
const MIN_SAMPLE_FOR_RISK = 3;

/** An order counts as overdue for this purpose the same way the rest of the app defines it
 *  (see getTailorStats' `over` and the chatbot's is_overdue view): still open past its promised
 *  delivery date. There's no separate "actually delivered late" timestamp to look at, so a
 *  currently-overdue order is the closest available proxy for "this combo tends to run late." */
function isOrderOverdue(o: Order): boolean {
  if (!o.deliveryDate) return false;
  const isOpen = o.status !== "delivered" && o.status !== "payment";
  return isOpen && daysLeft(o.deliveryDate) < 0;
}

/**
 * Flags a NEW order as likely-to-need-rework or likely-to-run-late before cutting starts,
 * based on how often this tailor's past orders for these garment type(s) were flagged rework
 * (order.reworkFlag, set manually via set_order_rework) or ran overdue. Prefers the exact
 * tailor + garment-type combination when there's enough history, falling back to the tailor's
 * overall record otherwise. Returns null when there isn't enough history either way — silence,
 * not a false "low risk," is the honest answer for a brand-new tailor or garment type.
 */
export function estimateReworkRisk(orders: Order[], tailorId: string, garmentTypes: string[]): ReworkRiskEstimate | null {
  if (!tailorId || garmentTypes.length === 0) return null;
  const types = new Set(garmentTypes);

  let pool = orders.filter((o) => o.tailor === tailorId && o.garments.some((g) => types.has(g.type)));
  let basis: ReworkRiskEstimate["basis"] = "combo";
  if (pool.length < MIN_SAMPLE_FOR_RISK) {
    pool = orders.filter((o) => o.tailor === tailorId);
    basis = "tailor";
  }
  if (pool.length < MIN_SAMPLE_FOR_RISK) return null;

  const flagged = pool.filter((o) => o.reworkFlag || isOrderOverdue(o)).length;
  const riskRate = Math.round((flagged / pool.length) * 100);
  const level: RiskLevel = riskRate >= 30 ? "high" : riskRate >= 15 ? "medium" : "low";

  return { level, riskRate, sampleSize: pool.length, basis };
}

export interface TailorRanking {
  tailorId: string;
  capacity: Capacity;
  activeCount: number;
  /** null when there isn't enough history to compute a risk rate yet (see estimateReworkRisk). */
  riskRate: number | null;
  /** null for a tailor with no completed orders yet. */
  avgDays: number | null;
}

/** Lower is better — same order the capacity badges already use elsewhere in the app. */
const CAPACITY_RANK: Record<Capacity, number> = { Low: 0, Normal: 1, High: 2, Overloaded: 3 };

/**
 * Ranks a shop's tailors for a NEW order with these garment type(s), best-first — folding
 * together three signals that already exist separately (current queue depth, this
 * tailor+garment-type combo's rework/overdue risk, historical turnaround) so the order form can
 * surface one recommendation instead of the owner mentally combining three numbers themselves.
 * A tailor with no order history yet ranks as available (Low capacity, unknown risk treated as
 * neutral) rather than being excluded — everyone starts somewhere.
 */
export function rankTailorsForOrder(orders: Order[], tailorIds: string[], garmentTypes: string[]): TailorRanking[] {
  const workloadById = new Map(getTailorWorkload(orders).map((w) => [w.tailor, w]));

  return tailorIds
    .map((tailorId) => {
      const workload = workloadById.get(tailorId);
      const risk = estimateReworkRisk(orders, tailorId, garmentTypes);
      return {
        tailorId,
        capacity: workload?.capacity ?? "Low",
        activeCount: workload?.active ?? 0,
        riskRate: risk?.riskRate ?? null,
        avgDays: workload && workload.done > 0 ? workload.avg : null,
      };
    })
    .sort((a, b) => {
      const capDiff = CAPACITY_RANK[a.capacity] - CAPACITY_RANK[b.capacity];
      if (capDiff !== 0) return capDiff;
      const riskDiff = (a.riskRate ?? 0) - (b.riskRate ?? 0);
      if (riskDiff !== 0) return riskDiff;
      return (a.avgDays ?? 0) - (b.avgDays ?? 0);
    });
}

/** No deposit at all, or a deposit under 20% of the order total — a fixed threshold for v1,
 *  not yet a configurable setting. Only orders still open (not delivered/paid) are relevant;
 *  a fully paid order's deposit history no longer matters operationally. */
const MIN_DEPOSIT_PCT = 0.2;

export function getDepositCompliance(orders: Order[]): Order[] {
  return orders
    .filter((o) => o.status !== "delivered" && o.status !== "payment")
    .filter((o) => o.total > 0 && o.advance / o.total < MIN_DEPOSIT_PCT)
    .sort((a, b) => a.advance / a.total - b.advance / b.total);
}

export interface BookingSourceRow {
  source: string;
  count: number;
  revenue: number;
}

export function getBookingSourceBreakdown(orders: Order[]): BookingSourceRow[] {
  const m: Record<string, BookingSourceRow> = {};
  orders.forEach((o) => {
    const key = o.bookingSource || "Not recorded";
    m[key] = m[key] || { source: key, count: 0, revenue: 0 };
    m[key].count += 1;
    m[key].revenue += o.total || 0;
  });
  return Object.values(m).sort((a, b) => b.count - a.count);
}

export interface OrderProfitabilityRow extends Order {
  cost: number;
  profit: number;
  marginPct: number;
  tailorCostIsEstimate: boolean;
}

/** Profit = customer price − tailor cost (real once the order reaches ready, estimated from
 *  the tailor rate card before that) − stitching expenses − manually-entered fabric/other
 *  cost. Same computeOrderProfit() used by the New Order form, Order Details, and the
 *  Stitching Orders list — see src/lib/order-profit.ts. Only as accurate as whoever fills in
 *  fabric/other cost and the tailor rate card. */
export interface ReorderCandidateRow {
  name: string;
  mobile: string;
  lastOrderDate: string;
  monthsSince: number;
  orders: Order[];
}

/** Customers whose most recent stitching order is older than the threshold — a pure
 *  computation over already-fetched data, same shape as every other report here. No
 *  persistence: a customer stays on this list until they place a new order, same as
 *  getReadyUncollected staying populated until an order is actually collected. */
export function getReorderCandidates(orders: Order[], monthsThreshold = 6): ReorderCandidateRow[] {
  const byMobile = new Map<string, Order[]>();
  orders.forEach((o) => {
    if (!o.mobile) return;
    const list = byMobile.get(o.mobile) || [];
    list.push(o);
    byMobile.set(o.mobile, list);
  });

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsThreshold);

  const rows: ReorderCandidateRow[] = [];
  byMobile.forEach((custOrders, mobile) => {
    const sorted = [...custOrders].sort((a, b) => (b.inDate || "").localeCompare(a.inDate || ""));
    const last = sorted[0];
    if (!last?.inDate) return;
    const lastDate = new Date(last.inDate);
    if (Number.isNaN(lastDate.getTime()) || lastDate >= cutoff) return;
    const monthsSince = Math.floor((Date.now() - lastDate.getTime()) / (30.44 * 86400000));
    rows.push({ name: last.name, mobile, lastOrderDate: last.inDate, monthsSince, orders: sorted });
  });

  return rows.sort((a, b) => b.monthsSince - a.monthsSince);
}

export interface TopReferrerRow {
  referrerMobile: string;
  referrerName: string;
  issued: number;
  redeemed: number;
  redemptionRate: number;
}

export function getTopReferrers(coupons: ReferralCoupon[]): TopReferrerRow[] {
  const m: Record<string, TopReferrerRow> = {};
  coupons.forEach((c) => {
    const row = (m[c.referrerMobile] ||= { referrerMobile: c.referrerMobile, referrerName: c.referrerName, issued: 0, redeemed: 0, redemptionRate: 0 });
    row.issued += 1;
    if (c.redeemedAt) row.redeemed += 1;
  });
  return Object.values(m)
    .map((r) => ({ ...r, redemptionRate: r.issued ? Math.round((r.redeemed / r.issued) * 100) : 0 }))
    .sort((a, b) => b.redeemed - a.redeemed);
}

export function getOrderProfitability(
  orders: Order[],
  rates: TailorRateCard,
  expensesByOrderId: Map<string, Pick<OrderExpense, "amount">[]>
): OrderProfitabilityRow[] {
  return orders
    .map((o) => {
      const breakdown = computeOrderProfit(o, rates, expensesByOrderId.get(o.id) || []);
      const cost = breakdown.tailorCost + breakdown.stitchingExpenses + breakdown.fabricCost + breakdown.otherCost;
      return { ...o, cost, profit: breakdown.profit, marginPct: breakdown.marginPct ?? 0, tailorCostIsEstimate: breakdown.tailorCostIsEstimate };
    })
    .sort((a, b) => b.profit - a.profit);
}
