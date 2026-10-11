"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_ALERT_PREFS, parseAlertPrefs, type AlertPrefs } from "@/lib/notification-alerts";

const KEY = "ff_alert_prefs_v1";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

/** Current prefs outside React (the realtime handler) — always read fresh so a change applies immediately. */
export function getAlertPrefs(): AlertPrefs {
  return typeof window === "undefined" ? DEFAULT_ALERT_PREFS : parseAlertPrefs(read());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Per-device alert switches (pop-ups, sound, vibration, quiet hours). Stored on the device, like the push opt-in. */
export function useAlertPrefs(): [AlertPrefs, (patch: Partial<AlertPrefs>) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const update = useCallback((patch: Partial<AlertPrefs>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...getAlertPrefs(), ...patch }));
    } catch {
      // storage blocked — the switch just won't stick
    }
    listeners.forEach((l) => l());
  }, []);
  return [parseAlertPrefs(raw), update];
}
