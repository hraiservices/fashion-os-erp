"use client";

import { useEffect } from "react";
import { isNativePlatform } from "@/lib/capacitor";

/**
 * Android's hardware/gesture back button does nothing by default inside a Capacitor WebView —
 * unlike a real browser, there's no built-in "go back in history, or exit if there's nowhere to
 * go" behavior wired up for it. Without this, back either does nothing (confusing — looks frozen)
 * or exits the app from screens the user would expect to just navigate back from. Renders nothing;
 * a no-op on the plain website/PWA, where the browser already owns this button.
 */
export function NativeBackButton() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    let remove: (() => void) | undefined;
    let cancelled = false;

    import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      const handle = App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else App.exitApp();
      });
      remove = () => void handle.then((h) => h.remove());
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return null;
}
