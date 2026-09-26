import { isNativePlatform } from "@/lib/capacitor";

type ImpactWeight = "light" | "medium" | "heavy";

// Web fallback durations (ms) for navigator.vibrate — chosen to feel proportionally heavier as
// the weight goes up, same reasoning as the native ImpactStyle tiers below.
const WEB_IMPACT_MS: Record<ImpactWeight, number> = { light: 10, medium: 20, heavy: 35 };

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

/**
 * A single tap-confirm haptic at the given weight. Inside the Capacitor shell, routes through
 * the native Haptics plugin — the real Taptic Engine on iOS, and a more consistent vibration
 * than a bare WebView reliably exposes on Android. Everywhere else (the plain website, the
 * installed PWA), falls back to `navigator.vibrate`, a silent no-op on browsers that don't
 * implement it (iOS Safari, desktop) — so this stays safe to call unconditionally from any click
 * handler.
 *
 * Use `light` for "the tap registered" acknowledgment on an ordinary button (the default,
 * `hapticTap()` below), `medium`/`heavy` for something with real weight — a destructive action
 * about to happen, a stage change taking effect. For "did this thing I started actually work,"
 * reach for hapticSuccess()/hapticError() instead — those use the OS's distinct notification
 * feedback rather than a plain impact, so a completed sale doesn't feel like just another tap.
 *
 * Fire-and-forget by design: callers use this synchronously from click handlers/mutation
 * callbacks and don't need to await it, so a failed/unsupported call is swallowed rather than
 * surfaced.
 */
export function hapticImpact(weight: ImpactWeight = "light") {
  if (isNativePlatform()) {
    import("@capacitor/haptics")
      .then(({ Haptics, ImpactStyle }) => {
        const style = weight === "heavy" ? ImpactStyle.Heavy : weight === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
        return Haptics.impact({ style });
      })
      .catch(() => {});
    return;
  }
  vibrate(WEB_IMPACT_MS[weight]);
}

/** Light tap-confirm — the original haptic helper, kept as the common case (most buttons just
 *  need "the tap registered," not a weighted impact or an outcome notification). */
export function hapticTap() {
  hapticImpact("light");
}

/** A completed sale, a saved order, a recorded payment, a stage that actually moved — anything
 *  where the user fired off an action and is now waiting to feel that it landed. Distinct from
 *  hapticTap()/hapticImpact() by design: this is confirmation of an OUTCOME, not of a touch, so
 *  it uses the OS's own success-notification feedback (a different physical sensation from a
 *  plain impact) rather than just a heavier tap. */
export function hapticSuccess() {
  if (isNativePlatform()) {
    import("@capacitor/haptics")
      .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }))
      .catch(() => {});
    return;
  }
  // A short-long pattern reads as "done" rather than "tapped" even on the crude vibrate() API.
  vibrate([10, 40, 20]);
}

/** The mutation this action started actually failed — network error, permission denied, a
 *  rejected stage change, a declined payment. Distinct from hapticSuccess() so a shop-floor user
 *  can feel the difference between "that worked" and "that didn't" without reading the toast. */
export function hapticError() {
  if (isNativePlatform()) {
    import("@capacitor/haptics")
      .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Error }))
      .catch(() => {});
    return;
  }
  vibrate([20, 60, 20, 60, 20]);
}
