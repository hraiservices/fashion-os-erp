"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { alertTitle, isCritical, notificationUrl, visibleToRole } from "@/lib/notification-alerts";
import { announceCritical } from "@/lib/notification-announce";
import { installAudioUnlock } from "@/lib/notification-sound";

export interface AdminNotification {
  id: number;
  type: string;
  order_id: string | null;
  employee_id: string | null;
  customer_name: string | null;
  from_stage: string | null;
  to_stage: string | null;
  user_name: string | null;
  message: string | null;
  /** Who caused it (realtime rows only) — they don't get an alert for their own action. */
  user_email?: string | null;
  created_at: string;
}

/** Server-filtered by role — see the API route's comment for why this can't be a direct
 *  client-side Supabase read like most of this app's other queries. */
async function fetchNotifications(): Promise<AdminNotification[]> {
  const res = await fetch("/api/notifications");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load notifications");
  return data.notifications || [];
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
  const router = useRouter();
  const { data: user } = useCurrentUser();
  // The channel is opened once; the handler reads the latest role/router through a ref.
  const latest = useRef({ email: user?.email, role: user?.role, open: (url: string) => router.push(url) });
  useEffect(() => {
    latest.current = { email: user?.email, role: user?.role, open: (url: string) => router.push(url) };
  });

  useEffect(() => {
    installAudioUnlock();
    const supabase = createClient();
    // Listening to INSERT only meant a dismiss/"Clear all" done from another tab or device
    // (an UPDATE, not an INSERT) never refreshed this client's list — it kept showing
    // already-cleared notifications until something else happened to invalidate the cache.
    const channel = supabase
      .channel("admin_notifications_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        // Only a genuinely new notification can alert (not a dismiss/"Clear all", which is an UPDATE), and only
        // a critical one that this role may see: pop-up + sound + vibration. Everything else is a silent badge.
        if (payload.eventType !== "INSERT") return;
        const n = payload.new as AdminNotification;
        const { role, email, open } = latest.current;
        if (!isCritical(n) || !visibleToRole(n.type, role)) return;
        if (n.user_email && email && n.user_email.toLowerCase() === email.toLowerCase()) return;
        announceCritical({ id: `notif-${n.id}`, title: alertTitle(n), body: n.message || "", url: notificationUrl(n) }, open);
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
