import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CashPosition, ComparisonTotals, DayClosing, DeliveryBoard, MethodSplit, RangeDay, ReviewFlag } from "@/lib/day-book-extras";
import type { AttendanceBoard, CashAdjustment, ClosingHistory, Collections, DiscountSummary, SoldToday } from "@/lib/day-book-insights";
import type { DayBookEntry, DayBookModule, TailorStageActivity, TailorStageOrder } from "@/lib/day-book";

export interface DayBookTotals {
  totalBilled: number;
  sales: number;
  payments: number;
  expenses: number;
  purchases: number;
  refunds: number;
  profit: number;
  // The three components of `profit` that Sales/Purchases/Expenses never surface on their own —
  // see route.ts's comment on why these are exposed alongside profit rather than left implicit.
  stitchingRevenue: number;
  stitchingCost: number;
  laborCost: number;
  salariesCost: number;
  payroll: number;
  invoicesCreated: number;
  ordersCreated: number;
  customersAdded: number;
  attendanceEvents: number;
  totalActivities: number;
}

export interface DayBookResponse {
  date: string;
  entries: DayBookEntry[];
  totals: DayBookTotals;
  tailorActivity: TailorStageActivity[];
  canSeePayroll: boolean;
  paymentMethods: MethodSplit;
  cash: CashPosition;
  closing: DayClosing | null;
  comparison: { yesterday: ComparisonTotals; lastWeek: ComparisonTotals };
  deliveries: DeliveryBoard;
  reviewFlags: ReviewFlag[];
  adjustments: CashAdjustment[];
  collections: Collections;
  attendance: AttendanceBoard;
  discounts: DiscountSummary;
  soldToday: SoldToday;
}

export type { DayBookEntry, DayBookModule, TailorStageActivity, TailorStageOrder };

/** Server-side date-scoped fetch (src/app/api/reports/day-book/route.ts) — never the whole
 *  table, just the selected day, re-queried on every date change. */
export function useDayBook(date: string) {
  return useQuery({
    queryKey: ["day-book", date],
    queryFn: async (): Promise<DayBookResponse> => {
      const res = await fetch(`/api/reports/day-book?date=${encodeURIComponent(date)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load Day Book");
      }
      return normalizeDayBook(await res.json());
    },
    staleTime: 30_000,
    // Reads live cash/balances another tab or device can change seconds earlier — see the
    // comment in src/app/providers.tsx on why this is opted in here specifically rather than
    // left as the app-wide default.
    refetchOnMount: "always",
  });
}

const ZERO_TOTALS: DayBookTotals = {
  totalBilled: 0, sales: 0, payments: 0, expenses: 0, purchases: 0, refunds: 0, profit: 0,
  stitchingRevenue: 0, stitchingCost: 0, laborCost: 0, salariesCost: 0, payroll: 0,
  invoicesCreated: 0, ordersCreated: 0, customersAdded: 0, attendanceEvents: 0, totalActivities: 0,
};

const ZERO_COMPARISON: ComparisonTotals = { sales: 0, payments: 0, expenses: 0, purchases: 0, refunds: 0, totalBilled: 0 };
const ZERO_CASH: CashPosition = {
  opening: 0, cashIn: 0, cashOut: 0, expected: 0, openingFromDate: null,
  breakdown: { receipts: 0, adjustmentsIn: 0, expenses: 0, vendorPayments: 0, advances: 0, adjustmentsOut: 0 },
};
const ZERO_DELIVERIES: DeliveryBoard = { dueToday: [], overdue: [], deliveredToday: [], unpaidOnDeliveredToday: 0 };
const ZERO_COLLECTIONS: Collections = { items: [], totalDue: 0, count: 0 };
const ZERO_ATTENDANCE: AttendanceBoard = { present: [], absent: [], onLeave: [], notMarked: [] };
const ZERO_DISCOUNTS: DiscountSummary = { total: 0, byUser: [], flagged: [], loyaltyRedeemed: 0 };
const ZERO_SOLD: SoldToday = { garments: [], products: [], newCustomers: 0, repeatCustomers: 0 };
const ZERO_SPLIT: MethodSplit = { cash: 0, upi: 0, card: 0, bank: 0, other: 0 };

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Merges a block over its zero shape, and every array inside it over an empty array. */
function block<T extends object>(value: unknown, zero: T): T {
  const given = (value && typeof value === "object" ? value : {}) as Partial<T>;
  const out = { ...zero, ...given } as T;
  for (const key of Object.keys(zero) as (keyof T)[]) {
    if (Array.isArray(zero[key]) && !Array.isArray(out[key])) out[key] = [] as T[keyof T];
  }
  return out;
}

/**
 * The page reads deep into this shape in ~30 places (data.totals.sales, data.cash.expected,
 * data.deliveries.dueToday.slice…). A body that is missing any one of those blocks — an older
 * deployment, a partial answer, a changed route — used to throw on the first read and take the
 * WHOLE Day Book down to the route-level error page. Filling every field once, here, from a
 * real zero shape rather than an empty cast, means a missing block shows as zero or empty on
 * its own card instead, and every other figure on the page still arrives.
 */
function normalizeDayBook(raw: unknown): DayBookResponse {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<DayBookResponse>;
  return {
    date: typeof r.date === "string" ? r.date : "",
    entries: asArray(r.entries),
    totals: block(r.totals, ZERO_TOTALS),
    tailorActivity: asArray(r.tailorActivity),
    canSeePayroll: r.canSeePayroll === true,
    paymentMethods: block(r.paymentMethods, ZERO_SPLIT),
    cash: { ...block(r.cash, ZERO_CASH), breakdown: block(r.cash?.breakdown, ZERO_CASH.breakdown) },
    closing: r.closing && typeof r.closing === "object" ? r.closing : null,
    comparison: {
      yesterday: block(r.comparison?.yesterday, ZERO_COMPARISON),
      lastWeek: block(r.comparison?.lastWeek, ZERO_COMPARISON),
    },
    deliveries: block(r.deliveries, ZERO_DELIVERIES),
    reviewFlags: asArray(r.reviewFlags),
    adjustments: asArray(r.adjustments),
    collections: block(r.collections, ZERO_COLLECTIONS),
    attendance: block(r.attendance, ZERO_ATTENDANCE),
    discounts: block(r.discounts, ZERO_DISCOUNTS),
    soldToday: block(r.soldToday, ZERO_SOLD),
  };
}

export function useDayBookRange(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ["day-book-range", from, to],
    enabled,
    queryFn: async (): Promise<{ from: string; to: string; days: RangeDay[] }> => {
      const res = await fetch(`/api/reports/day-book/range?from=${from}&to=${to}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load range");
      }
      // Same reason as normalizeDayBook: the month strip and the best/worst-day panel map and
      // filter over `days` directly, so a body without it took the whole page down.
      const body = (await res.json()) as Partial<{ from: string; to: string; days: RangeDay[] }>;
      return { from: body.from ?? from, to: body.to ?? to, days: Array.isArray(body.days) ? body.days : [] };
    },
    staleTime: 30_000,
    refetchOnMount: "always",
  });
}

export function useCloseDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { date: string; countedCash: number; note: string }) => {
      const res = await fetch("/api/reports/day-book/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to close the day");
      return body as { ok: true; variance: number; expected: number };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["day-book", vars.date] });
      qc.invalidateQueries({ queryKey: ["day-book-history"] });
    },
  });
}

/** Last 30 days of cash-close results + days with activity that were never closed. */
export function useClosingHistory() {
  return useQuery({
    queryKey: ["day-book-history"],
    queryFn: async (): Promise<ClosingHistory> => {
      const res = await fetch("/api/reports/day-book/history");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load closing history");
      }
      const body = (await res.json()) as Partial<ClosingHistory>;
      return { closings: asArray(body?.closings), unclosedDays: asArray(body?.unclosedDays) };
    },
    staleTime: 5 * 60_000,
  });
}

export function useAddCashAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { date: string; kind: "in" | "out"; amount: number; reason: string; note: string }) => {
      const res = await fetch("/api/reports/day-book/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to record cash adjustment");
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["day-book", vars.date] }),
  });
}

export function useRemoveCashAdjustment(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/reports/day-book/adjustments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to remove cash adjustment");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["day-book", date] }),
  });
}
