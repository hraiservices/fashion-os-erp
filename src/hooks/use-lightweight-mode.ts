"use client";

import { useCallback, useSyncExternalStore } from "react";
import { LITE_MODE_CHANGE_EVENT, applyLiteMode, readLiteMode } from "@/lib/lightweight-mode";

function subscribe(callback: () => void) {
  window.addEventListener(LITE_MODE_CHANGE_EVENT, callback);
  return () => window.removeEventListener(LITE_MODE_CHANGE_EVENT, callback);
}

function getServerSnapshot() {
  return false;
}

/** Live-reactive read of this device's Light Weight mode choice — every component that calls
 *  this re-renders the instant the toggle (topbar icon or Settings → Account) flips it,
 *  wherever it's flipped from, without needing a context provider. Server-rendered markup
 *  always starts "off" (no localStorage during SSR) and corrects itself on hydration, same as
 *  the light/dark toggle. */
export function useLightweightMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readLiteMode, getServerSnapshot);
  const setOn = useCallback((next: boolean) => applyLiteMode(next), []);
  return [on, setOn];
}
