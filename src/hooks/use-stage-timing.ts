"use client";

import { useQuery } from "@tanstack/react-query";
import type { Stage } from "@/lib/business-rules";
import type { DateRange } from "@/lib/report-date-range";

export interface StageTimingRow {
  id: number;
  orderId: string;
  customerName: string;
  customerMobile: string;
  fromStage: Stage | null;
  fromLabel: string;
  toStage: Stage | null;
  toLabel: string;
  changedAt: string;
  durationMinutes: number | null;
  userEmail: string | null;
  userName: string;
}

export interface StageTimingBucket {
  stage: Stage;
  label: string;
  avgMinutes: number;
  count: number;
}

export interface StageTimingEmployee {
  email: string | null;
  name: string;
  avgMinutes: number;
  count: number;
}

export interface StageTimingResponse {
  rows: StageTimingRow[];
  byStage: StageTimingBucket[];
  byEmployee: StageTimingEmployee[];
  summary: { count: number; avgMinutes: number };
}

/** Server-computed — durations depend on each order's FULL stage-change history, not just what
 *  falls in the visible range (see the route's own comment), so this can't be filtered client-side
 *  from an already-fetched list the way most reports work. */
export function useStageTiming(range: DateRange) {
  return useQuery({
    queryKey: ["stage-timing", range.from, range.to],
    queryFn: async (): Promise<StageTimingResponse> => {
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      const res = await fetch(`/api/reports/stage-timing?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load report");
      return data;
    },
    staleTime: 30_000,
  });
}
