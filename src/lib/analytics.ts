// Ported from Stitching_Manager_Pro_v16.html ~lines 2373-2524 (Analytics helpers).
import { daysLeft, loyaltyDiscountOf, loyaltyTier, DEFAULT_LOYALTY_CONFIG, type LoyaltyConfig } from "@/lib/business-rules";
import { isOrderOutstanding } from "@/lib/balances";
import type { Order, Customer } from "@/lib/types";

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
    months.push(d.toISOString().substring(0, 7));
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
      collected: mo.reduce((s, o) => s + Math.max(0, Math.min(o.advance || 0, o.total || 0) - loyaltyDiscountOf(o)), 0),
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
    months.push(d.toISOString().substring(0, 7));
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
}

/** Profit = customer price − manually-entered fabric/other cost. Only as accurate as whoever
 *  fills in those cost fields on the order form — see order-form.tsx's Costs section. */
export function getOrderProfitability(orders: Order[]): OrderProfitabilityRow[] {
  return orders
    .map((o) => {
      const cost = (o.fabricCost || 0) + (o.otherCost || 0);
      const profit = (o.total || 0) - cost;
      const marginPct = o.total ? Math.round((profit / o.total) * 100) : 0;
      return { ...o, cost, profit, marginPct };
    })
    .sort((a, b) => b.profit - a.profit);
}
