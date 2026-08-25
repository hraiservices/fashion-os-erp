import { useQuery } from "@tanstack/react-query";
import type { DayBookEntry, DayBookModule } from "@/lib/day-book";

export interface DayBookTotals {
  sales: number;
  payments: number;
  expenses: number;
  purchases: number;
  refunds: number;
  profit: number;
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
  canSeePayroll: boolean;
}

export type { DayBookEntry, DayBookModule };

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
