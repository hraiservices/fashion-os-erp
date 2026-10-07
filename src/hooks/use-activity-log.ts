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

// A growth safety net, not real pagination — same convention as use-orders.ts's SAFETY_LIMIT.
// The page itself defaults to a bounded date range (last 30 days) so a normal "what happened
// recently" view never gets near this; it only matters when someone picks "All time" on a shop
// with years of history, where this is still far beyond realistic daily activity-log volume.
const SAFETY_LIMIT = 50_000;

export interface ActivityLogRange {
  /** Inclusive, yyyy-mm-dd (local). Omit for no lower bound. */
  from?: string;
  /** Inclusive, yyyy-mm-dd (local) — queried as < the next day since created_at is a timestamp. */
  to?: string;
}

async function fetchActivityLog(range: ActivityLogRange): Promise<ActivityLogEntry[]> {
  const supabase = createClient();
  let query = supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(SAFETY_LIMIT);
  if (range.from) query = query.gte("created_at", `${range.from}T00:00:00`);
  if (range.to) query = query.lt("created_at", `${range.to}T23:59:59.999`);

  const [{ data, error }, { data: employees }] = await Promise.all([query, supabase.from("employees").select("id, name")]);
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

export function useActivityLog(range: ActivityLogRange = {}) {
  return useQuery({
    queryKey: ["activity-log", range.from, range.to],
    queryFn: () => fetchActivityLog(range),
    staleTime: 30_000,
  });
}
