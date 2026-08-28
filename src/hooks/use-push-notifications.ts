"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

/** applicationServerKey must be a Uint8Array, but env vars are strings — standard VAPID base64url decode. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushSupportState = "unsupported" | "denied" | "default" | "granted";

function noopSubscribe() {
  return () => {};
}

function getSnapshot(): PushSupportState {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return Notification.permission as PushSupportState;
}

function getServerSnapshot(): PushSupportState | null {
  return null;
}

/** Web Push opt-in for the current device — one row in push_subscriptions per device/user. See supabase/migrations/add_push_subscriptions.sql and src/lib/push.ts (server send side). */
export function usePushNotifications() {
  const { data: user } = useCurrentUser();
  // null on the server and on the first client render (before hydration) — avoids the flash
  // where the component briefly renders with a value that won't match the server-rendered HTML.
  const detected = useSyncExternalStore(noopSubscribe, getSnapshot, getServerSnapshot);
  // Overrides `detected` once the user has explicitly requested permission this session.
  const [override, setOverride] = useState<PushSupportState | null>(null);
  const state = override ?? detected;
  const [busy, setBusy] = useState(false);

  const subscribe = useCallback(async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey || !user?.email) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setOverride(permission as PushSupportState);
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

      const supabase = createClient();
      await supabase.from("push_subscriptions").upsert(
        { email: user.email, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
        { onConflict: "endpoint" }
      );
    } finally {
      setBusy(false);
    }
  }, [user?.email]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      const supabase = createClient();
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    } finally {
      setBusy(false);
    }
  }, []);

  return { state: state ?? "unsupported" as PushSupportState, hydrated: state !== null, busy, subscribe, unsubscribe };
}
