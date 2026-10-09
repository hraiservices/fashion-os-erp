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
      return res.json();
    },
    staleTime: 30_000,
  });
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
      return res.json();
    },
    staleTime: 30_000,
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
      return res.json();
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
