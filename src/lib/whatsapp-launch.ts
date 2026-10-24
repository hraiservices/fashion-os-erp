"use client";

import { useSyncExternalStore } from "react";

/**
 * Picking between WhatsApp and WhatsApp Business when a phone has both installed. A web page
 * can't enumerate installed apps, so this can't detect "both are present" — it just always
 * offers the two known variants and remembers which one a person picked, per device
 * (localStorage), so the chooser only has to be answered once.
 */
export type WhatsAppApp = "regular" | "business";

const STORAGE_KEY = "whatsapp-app-preference";

/** null means "not yet asked" — distinct from reading failure, which also returns null so the
 *  chooser degrades to "ask every time" rather than throwing. */
export function getWhatsAppPreference(): WhatsAppApp | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "regular" || v === "business" ? v : null;
  } catch {
    return null;
  }
}

export function setWhatsAppPreference(app: WhatsAppApp | null) {
  try {
    if (app) localStorage.setItem(STORAGE_KEY, app);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort — private browsing / storage blocked just means the chooser asks again next time.
  }
  whatsAppPreferenceListeners.forEach((l) => l());
}

const whatsAppPreferenceListeners = new Set<() => void>();

function subscribeWhatsAppPreference(cb: () => void) {
  whatsAppPreferenceListeners.add(cb);
  return () => whatsAppPreferenceListeners.delete(cb);
}

/** `useSyncExternalStore`-compatible reader — see src/hooks/use-alert-prefs.ts for the same
 *  pattern. Server snapshot is always null (no localStorage there), so the chooser button renders
 *  consistently through hydration and only switches to "direct link" once the client confirms a
 *  saved preference actually exists. */
export function useWhatsAppPreferenceStore(): WhatsAppApp | null {
  return useSyncExternalStore(subscribeWhatsAppPreference, getWhatsAppPreference, () => null);
}

/**
 * Rewrites a wa.me href to open WhatsApp Business specifically, via an Android "intent:" URL
 * that targets its app package (com.whatsapp.w4b) directly instead of letting the OS pick —
 * see developer.chrome.com/docs/android/intent for the syntax. WhatsApp Business registers
 * itself as a wa.me handler too, so this only works because the link stays a wa.me link
 * underneath; if WhatsApp Business isn't installed, the intent simply fails to open (no crash,
 * no fallback dialog from us — same as if a person had typed the intent manually).
 * Non-Android (iOS, desktop) has no equivalent way to address one chat app over another from a
 * web page, so there the href is returned unchanged.
 */
export function resolveWhatsAppHref(href: string, app: WhatsAppApp): string {
  if (app === "regular") return href;
  if (typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return href;
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.whatsapp.w4b;end`;
}
