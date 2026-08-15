"use client";

import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Settings > Account — per-device push notification opt-in/out. State is per browser/device, not per account, so this only ever reflects "this device," matching how Web Push actually works. */
export function PushNotificationsSection() {
  const { state, hydrated, busy, subscribe, unsubscribe } = usePushNotifications();

  // Not yet hydrated (SSR → first client paint) or genuinely unsupported — hide rather than flash.
  if (!hydrated || state === "unsupported") return null;

  async function handleEnable() {
    try {
      await subscribe();
      toast.success("Notifications enabled on this device");
    } catch {
      toast.error("Could not enable notifications");
    }
  }

  async function handleDisable() {
    try {
      await unsubscribe();
      toast.success("Notifications turned off on this device");
    } catch {
      toast.error("Could not turn off notifications");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Push notifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {state === "denied"
            ? "Notifications are blocked for this site in your browser settings — enable them there to turn this on."
            : "Get notified on this device for things like the daily briefing. Applies only to this device/browser, not your whole account."}
        </p>
        {state === "granted" ? (
          <Button variant="outline" disabled={busy} onClick={handleDisable}>
            <BellOff className="size-4" /> Turn off on this device
          </Button>
        ) : (
          <Button disabled={busy || state === "denied"} onClick={handleEnable}>
            <Bell className="size-4" /> {busy ? "Enabling…" : "Enable on this device"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
