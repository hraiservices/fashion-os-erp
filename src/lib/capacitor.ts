import { Capacitor } from "@capacitor/core";

/**
 * True only inside the Capacitor Android/iOS shell (see capacitor.config.ts) — false for the
 * plain website and the installed PWA, both of which still run in a regular browser context.
 * @capacitor/core is tiny and safe to import unconditionally everywhere (its web fallback is a
 * no-op), so every native-only code path in this app is gated on this check rather than an
 * environment variable, keeping one build that behaves correctly in both contexts.
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
