"use client";

import { Zap, ZapOff } from "lucide-react";
import { useLightweightMode } from "@/hooks/use-lightweight-mode";
import { Button } from "@/components/ui/button";

/** Quick on/off for Light Weight mode, next to the light/dark toggle — see lightweight-mode.ts
 *  for what it strips. Same control also lives in Settings → Account for discoverability. */
export function LightweightToggle() {
  const [on, setOn] = useLightweightMode();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-8"
      aria-label={on ? "Turn off Light Weight mode" : "Turn on Light Weight mode"}
      aria-pressed={on}
      title={on ? "Light Weight mode on — tap to turn off" : "Turn on Light Weight mode"}
      onClick={() => setOn(!on)}
    >
      {on ? <Zap className="size-4 fill-current" /> : <ZapOff className="size-4" />}
    </Button>
  );
}
