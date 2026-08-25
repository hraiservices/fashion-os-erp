"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ActivityLogEntry {
  id: number;
  user_email: string | null;
  user_name: string | null;
  action: string;
  order_id: string | null;
  details: string | null;
  created_at: string;
}

async function fetchActivityLog(): Promise<ActivityLogEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  return data || [];
}

export function useActivityLog() {
  return useQuery({
    queryKey: ["activity-log"],
    queryFn: fetchActivityLog,
    staleTime: 30_000,
  });
}

export interface OrderPaymentActivityRow {
  id: number;
  action: string;
  order_id: string;
  created_at: string;
}

/** Stitching-order payment rows only, all-time, filtered server-side by the `action` text
 *  pattern itself — for reports (Payment Methods, Payments Received) that need every payment
 *  ever collected, not just the most recent 300 log rows useActivityLog() caps at. There's no
 *  standalone order-payments table (see day-book.ts's extractOrderPayments), so this is the
 *  same activity_log text-extraction approach, just fetched without the recency cap. */
export function useOrderPaymentActivity() {
  return useQuery({
    queryKey: ["activity-log", "order-payments"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, action, order_id, created_at")
        .not("order_id", "is", null)
        .ilike("action", "💰 Payment ₹%");
      if (error) throw error;
      return (data || []) as OrderPaymentActivityRow[];
    },
    staleTime: 30_000,
  });
}
