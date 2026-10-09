"use client";

import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "@/lib/report-date-range";

export interface ReworkInstanceRow {
  id: number;
  orderId: string;
  customerName: string;
  customerMobile: string;
  tailorId: string;
  tailorName: string;
  garmentTypes: string[];
  reason: string;
  flaggedByEmail: string | null;
  flaggedByName: string;
  flaggedAt: string;
  resolvedAt: string | null;
}

export interface ReworkInstancesResponse {
  rows: ReworkInstanceRow[];
}

/** Server-computed — pairing each "flagged" event with whatever "cleared" event resolved it
 *  depends on an order's FULL rework history, not just what falls in the visible range (see the
 *  route's own comment), so this can't be filtered client-side from an already-fetched list the
 *  way most reports work. */
export function useReworkInstances(range: DateRange) {
  return useQuery({
    queryKey: ["rework-instances", range.from, range.to],
    queryFn: async (): Promise<ReworkInstancesResponse> => {
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      const res = await fetch(`/api/reports/rework-instances?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load report");
      return data;
    },
    staleTime: 30_000,
  });
}
