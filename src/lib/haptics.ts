import { isNativePlatform } from "@/lib/capacitor";

/**
 * Fires a short tap-confirm haptic. Inside the Capacitor shell, routes through the native
 * Haptics plugin — the real Taptic Engine on iOS, and a more consistent vibration than a bare
 * WebView reliably exposes on Android. Everywhere else (the plain website, the installed PWA),
 * falls back to `navigator.vibrate`, a silent no-op on browsers that don't implement it (iOS
 * Safari, desktop) — so this stays safe to call unconditionally from any click handler.
 *
 * Fire-and-forget by design: callers use this synchronously from click handlers and don't need
 * to await it, so a failed/unsupported call is swallowed rather than surfaced.
 */
export function hapticTap() {
  if (isNativePlatform()) {
    import("@capacitor/haptics")
      .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
      .catch(() => {});
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}
