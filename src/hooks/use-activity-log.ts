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
