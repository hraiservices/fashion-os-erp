"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

const HEARTBEAT_INTERVAL_MS = 30_000;

/** Pings /api/presence/heartbeat immediately and every 30s while `enabled` — see that route's
 *  comment for what identifies the caller. Mount this once per surface that should count as
 *  "live": the app shell layout (portal users) and the /checkin page (checkin-only employees). */
export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const ping = () => fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
    ping();
    const id = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}

export interface LiveUser {
  subjectKey: string;
  loginType: "portal" | "checkin";
  method: "email" | "phone" | "pin";
  displayName: string;
  role: string | null;
  lastSeen: string;
}

interface LiveResponse {
  live: LiveUser[];
  lastLogin: { displayName: string; occurredAt: string } | null;
}

/** Admin-only — the caller decides whether to render anything for a non-admin (the API route
 *  401s/403s them anyway). Refetches every 20s so the dashboard card and the Users & Access
 *  section both stay close to real-time without needing their own heartbeat. */
export function useLiveUsers(enabled = true) {
  return useQuery({
    queryKey: ["presence-live"],
    queryFn: async (): Promise<LiveResponse> => {
      const res = await fetch("/api/presence/live");
      if (!res.ok) return { live: [], lastLogin: null };
      return res.json();
    },
    refetchInterval: 20_000,
    enabled,
  });
}

export interface LoginEvent {
  id: string;
  occurredAt: string;
  loginType: "portal" | "checkin";
  method: "email" | "phone" | "pin";
  displayName: string;
  role: string | null;
}

export function useLoginEvents(enabled = true) {
  return useQuery({
    queryKey: ["login-events"],
    queryFn: async (): Promise<LoginEvent[]> => {
      const res = await fetch("/api/presence/login-events");
      if (!res.ok) return [];
      const data = await res.json();
      return data.events || [];
    },
    enabled,
  });
}
