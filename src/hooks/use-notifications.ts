"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AdminNotification {
  id: number;
  type: string;
  order_id: string | null;
  customer_name: string | null;
  from_stage: string | null;
  to_stage: string | null;
  user_name: string | null;
  message: string | null;
  created_at: string;
}

async function fetchNotifications(): Promise<AdminNotification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("admin_notifications")
    .select("id, type, order_id, customer_name, from_stage, to_stage, user_name, message, created_at")
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return data || [];
}

/** Per-item dismiss — additive on top of the existing bulk "Clear all", doesn't touch that behavior. */
export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const supabase = createClient();
      const { error } = await supabase.from("admin_notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/**
 * Realtime notifications, replacing the old app's hand-rolled WebSocket parsing +
 * 60s poll fallback (lines ~13611-14082) with a Supabase Realtime channel that just
 * invalidates the React Query cache on INSERT.
 */
export function useNotifications() {
  const qc = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin_notifications_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    staleTime: 15_000,
  });
}

const SEEN_KEY = "sw_notifs_seen_v1";

export function markNotificationsSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, Date.now().toString());
  } catch {
    // localStorage unavailable — non-fatal, badge just won't persist across reloads.
  }
}

export function getLastSeenAt(): number {
  try {
    return parseInt(localStorage.getItem(SEEN_KEY) || "0", 10);
  } catch {
    return 0;
  }
}

/** getTimeAgo(), Stitching_Manager_Pro_v16.html ~line 14018. */
export function getTimeAgo(isoStr: string): string {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
