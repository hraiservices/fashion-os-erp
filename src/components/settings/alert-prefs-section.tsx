"use client";

import { BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAlertPrefs } from "@/hooks/use-alert-prefs";
import { announceCritical } from "@/lib/notification-announce";
import { cn } from "@/lib/utils";

function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className={cn("flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}>
        <span className={cn("size-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
      </span>
    </button>
  );
}

/** Settings > Personalize: how critical alerts (leave requests, payments received, orders needing attention, a day left open) reach this device. */
export function AlertPrefsSection() {
  const [prefs, update] = useAlertPrefs();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Critical alerts on this device</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Only things that need action: leave requests, payments received, orders that need attention, a day left open. Everything else stays quietly in the bell. Applies to this device only.</p>
        <Switch label="Pop-up" hint="A banner that stays until you dismiss it" on={prefs.popups} onChange={(popups) => update({ popups })} />
        <Switch label="Sound" hint="A clear alert tone (turns on after your first tap in the app)" on={prefs.sound} onChange={(sound) => update({ sound })} />
        <Switch label="Vibration" hint="Phone buzzes (not available on iPhone browsers)" on={prefs.vibration} onChange={(vibration) => update({ vibration })} />
        <Switch label="Quiet hours" hint="No sound or vibration in this window — the pop-up still shows" on={prefs.quietHours} onChange={(quietHours) => update({ quietHours })} />
        {prefs.quietHours && (
          <div className="flex items-center gap-2 text-sm">
            <Input type="time" value={prefs.quietFrom} onChange={(e) => e.target.value && update({ quietFrom: e.target.value })} className="h-11 w-32" aria-label="Quiet from" />
            to
            <Input type="time" value={prefs.quietTo} onChange={(e) => e.target.value && update({ quietTo: e.target.value })} className="h-11 w-32" aria-label="Quiet until" />
          </div>
        )}
        <Button variant="outline" className="h-11" onClick={() => announceCritical({ id: "test-alert", title: "Test alert", body: "This is how a critical alert looks and sounds.", url: null }, () => {})}>
          <BellRing className="size-4" /> Send a test alert
        </Button>
      </CardContent>
    </Card>
  );
}
