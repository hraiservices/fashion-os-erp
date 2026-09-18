"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { isNativePlatform } from "@/lib/capacitor";
import type { PushSupportState } from "@/hooks/use-push-notifications";

/**
 * Native push (FCM) opt-in for the current device, inside the Capacitor shell — the counterpart
 * to use-push-notifications.ts (Web Push) for the plain website/PWA. `state` uses the same
 * PushSupportState shape as that hook so PushNotificationsSection can branch between the two
 * without either needing to know about the other's plugin details. One row per device in
 * native_push_tokens (see supabase/migrations/add_native_push_tokens.sql); actually delivering to
 * these tokens is the server-side FCM v1 path in src/lib/push.ts, which needs a Firebase project
 * configured (FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY env vars) — this hook only
 * handles registering the device, not sending.
 */
export function useNativePush() {
  const { data: user } = useCurrentUser();
  const [state, setState] = useState<PushSupportState>("unsupported");
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativePlatform()) return;
    let cancelled = false;
    let removeListener: (() => void) | undefined;

    import("@capacitor/push-notifications").then(async ({ PushNotifications }) => {
      const { receive } = await PushNotifications.checkPermissions();
      if (cancelled) return;
      setState(receive === "granted" ? "granted" : receive === "denied" ? "denied" : "default");
      // Re-registering when permission was already granted in an earlier session doesn't
      // re-prompt the user — it just re-fires the "registration" event with the current token,
      // which is what populates tokenRef so unsubscribe() has something to delete this session.
      if (receive === "granted") {
        const handle = PushNotifications.addListener("registration", (t) => {
          tokenRef.current = t.value;
        });
        removeListener = () => void handle.then((h) => h.remove());
        PushNotifications.register();
      }
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!isNativePlatform() || !user?.email) return;
    setBusy(true);
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { receive } = await PushNotifications.requestPermissions();
      setState(receive === "granted" ? "granted" : receive === "denied" ? "denied" : "default");
      if (receive !== "granted") return;

      const token = await new Promise<string>((resolve, reject) => {
        const registrationHandle = PushNotifications.addListener("registration", (t) => {
          registrationHandle.then((h) => h.remove());
          errorHandle.then((h) => h.remove());
          resolve(t.value);
        });
        const errorHandle = PushNotifications.addListener("registrationError", (e) => {
          registrationHandle.then((h) => h.remove());
          errorHandle.then((h) => h.remove());
          reject(new Error(e.error));
        });
        PushNotifications.register();
      });

      tokenRef.current = token;
      const supabase = createClient();
      await supabase
        .from("native_push_tokens")
        .upsert({ email: user.email, token, platform: Capacitor.getPlatform() }, { onConflict: "token" });
    } finally {
      setBusy(false);
    }
  }, [user?.email]);

  const unsubscribe = useCallback(async () => {
    if (!tokenRef.current) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.from("native_push_tokens").delete().eq("token", tokenRef.current);
      tokenRef.current = null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, hydrated: true, busy, subscribe, unsubscribe };
}
