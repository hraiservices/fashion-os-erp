/**
 * Fires a short device vibration on Android (Chrome); a silent no-op everywhere else — iOS
 * Safari and desktop browsers simply don't implement `navigator.vibrate`, so this is safe to
 * call unconditionally from any click handler that should feel like a native confirm/tap.
 */
export function hapticTap() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}
