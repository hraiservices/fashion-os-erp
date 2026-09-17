"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DASHBOARD_ACCESS_EMAIL_RE } from "@/lib/day-book";

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
  const [{ data, error }, { data: employees }] = await Promise.all([
    supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("employees").select("id, name"),
  ]);
  if (error) throw error;
  // A tailor/employee who logs into the main app (rather than just the attendance PIN) is
  // provisioned with a synthetic `emp-<id>@dashboard.local` email — resolve it back to their
  // real name into user_name (the field the page already prefers for display), same as the Day
  // Book report does, instead of showing the raw employee id. Real emails are left for the
  // page's own `user_name || user_email` fallback to handle, unchanged.
  // logAction() writes user_name at insert time from the same bad "email local part"
  // convention, so a dashboard-access row's stored user_name is already the raw employee id —
  // not something a fallback-when-null can fix. Always re-resolve from user_email when it
  // matches that pattern, overriding whatever was stored.
  const employeeNameById = new Map((employees || []).map((e) => [e.id, e.name]));
  return (data || []).map((r) => {
    if (!r.user_email) return r;
    const match = r.user_email.match(DASHBOARD_ACCESS_EMAIL_RE);
    const name = match && employeeNameById.get(match[1]);
    return name ? { ...r, user_name: name } : r;
  });
}

export function useActivityLog() {
  return useQuery({
    queryKey: ["activity-log"],
    queryFn: fetchActivityLog,
    staleTime: 30_000,
  });
}
