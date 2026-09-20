"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * The topbar notification bell (rendered on EVERY authenticated page, not just the orders
 * screen) previously called useOrders(), which selects every heavy JSONB column (garments,
 * history, measurements, payments, pay_breakdown) — confirmed by a live performance audit as a
 * real over-fetch: the bell only ever reads id/name/status/deliveryDate/createdAt.
 *
 * Deliberate separate query key from useOrders() — this is NOT a lighter version of that same
 * cache entry, it's a genuinely different, much smaller payload so it doesn't force every page
 * in the app to pull the full order list just to show a badge count.
 */
export interface UrgentOrderSummary {
  id: string;
  name: string;
  status: string;
  deliveryDate: string;
  createdAt: string;
}

const SAFETY_LIMIT = 20_000;

async function fetchUrgentOrdersSummary(): Promise<UrgentOrderSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, name, status, delivery_date, created_at")
    .order("created_at", { ascending: false })
    .limit(SAFETY_LIMIT);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    deliveryDate: r.delivery_date,
    createdAt: r.created_at,
  }));
}

export function useUrgentOrdersSummary() {
  return useQuery({
    queryKey: ["orders-summary"],
    queryFn: fetchUrgentOrdersSummary,
  });
}
