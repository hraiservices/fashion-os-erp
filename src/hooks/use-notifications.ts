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

/** Per-item dismiss — additive on top of the existing bulk "Clear all", doesn't touch that behavior.
 *  Marks it read for the CALLER only (/api/notifications/[id]/dismiss, notification_reads) — a
 *  shared `read` column on admin_notifications previously meant dismissing one notification hid
 *  it from every other user too. */
export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}/dismiss`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dismiss notification");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** Marks every notification currently unread for the CALLER as read — safe for any role now
 *  that read state is per-user (previously admin/manager-only, since it flipped a column shared
 *  by everyone). */
export function useClearAllNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/clear-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear notifications");
      return data as { cleared: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export interface NotificationHistoryEntry extends AdminNotification {
  isRead: boolean;
}

/** Everything this user may see, read or not (capped at 100) — the bell itself only ever shows
 *  unread. For the /notifications history page. */
export function useNotificationHistory() {
  return useQuery({
    queryKey: ["notifications", "history"],
    queryFn: async (): Promise<NotificationHistoryEntry[]> => {
      const res = await fetch("/api/notifications/history");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load notification history");
      return data.notifications || [];
    },
    staleTime: 15_000,
  });
}

/** This user's own muted notification categories (notification_mutes) — never affects anyone else. */
export function useNotificationMutes() {
  return useQuery({
    queryKey: ["notification-mutes"],
    queryFn: async (): Promise<string[]> => {
      const res = await fetch("/api/notifications/mutes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load mute preferences");
      return data.muted || [];
    },
    staleTime: 60_000,
  });
}

export function useSetNotificationMute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, muted }: { category: string; muted: boolean }) => {
      const res = await fetch("/api/notifications/mutes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, muted }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update mute preference");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-mutes"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
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
    // Dismiss/"Clear all" write to notification_reads now (per-user — see
    // add_notification_per_user_state.sql), not an UPDATE on admin_notifications itself, so this
    // channel only ever sees INSERT for a brand-new notification. A dismiss made from a second
    // tab/device logged into the SAME account won't live-push here; it catches up within this
    // query's 15s staleTime on its own, which is an acceptable amount of staleness for a same-
    // user, different-tab edge case rather than standing up a second realtime subscription for it.
    const channel = supabase
      .channel("admin_notifications_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_notifications" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
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
