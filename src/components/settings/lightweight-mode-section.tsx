"use client";

import { Zap } from "lucide-react";
import { useLightweightMode } from "@/hooks/use-lightweight-mode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Same bare switch as alert-prefs-section.tsx — no shared ui/switch component exists yet. */
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn("flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}>
      <span className={cn("size-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
    </button>
  );
}

/**
 * Same control as the topbar's lightning-bolt icon, surfaced here for discoverability — personal,
 * per-device, instant (no Save step, nothing synced). Strips animations, avatar photos, charts,
 * export/print menus, and background "live" polling; data tables collapse to just their most
 * important columns.
 */
export function LightweightModeSection() {
  const [on, setOn] = useLightweightMode();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Zap className="size-4" /> Light Weight mode
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <p className="flex-1 text-xs text-muted-foreground">
            Just for this device. Hides charts, photos, export menus, and background live-updates — shows only the essentials. No animations either.
          </p>
          <Switch on={on} onChange={setOn} label="Light Weight mode" />
        </div>
      </CardContent>
    </Card>
  );
}
