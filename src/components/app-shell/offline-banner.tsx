"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Without this, losing connectivity on mobile just makes every save/delete silently fail with
 * a generic "Failed to ..." toast — there's no signal that the device itself is offline, which
 * reads as the app being broken rather than the network being down. Native apps always surface
 * connectivity state directly. `navigator.onLine` can false-positive (reports "online" on a
 * captive portal or a weak signal), but it reliably catches airplane mode / no-signal, which is
 * the common case worth a banner for.
 *
 * `useSyncExternalStore` (not an effect + setState) keeps this SSR/hydration-safe: the server
 * snapshot is always "online" (no navigator on the server), and the client re-syncs to the real
 * value on mount without a synchronous setState-in-effect render cascade.
 */
export function OfflineBanner() {
  const offline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false
  );

  if (!offline) return null;

  return (
    <div className="flex items-center gap-2 border-b bg-red-50 px-4 py-2 text-sm text-red-800 print:hidden dark:bg-red-950/40 dark:text-red-300">
      <WifiOff className="size-4 shrink-0" />
      <span>You&apos;re offline — changes won&apos;t be saved until your connection comes back.</span>
    </div>
  );
}
