"use client";

import { useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { TEXT_SIZES, DEFAULT_TEXT_SIZE, applyTextSize, readTextSize } from "@/lib/text-size";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function noopSubscribe() {
  return () => {};
}
function getMountedSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}

/**
 * Personal text size, for this device only — not synced anywhere, not visible to anyone else.
 * Different phones (and different eyes) want different sizes even at the same shop-wide base
 * size from Settings → Font, so this is a straight multiplier on top of that, applied instantly
 * with no Save step since there's no server round-trip to wait on.
 */
export function TextSizeSection() {
  // Same mounted-guard as theme-toggle.tsx: localStorage isn't available during SSR, so the
  // server-rendered markup shows the default until hydration, then this flips to the device's
  // actual stored choice — avoiding a hydration-mismatch warning from reading it eagerly.
  const mounted = useSyncExternalStore(noopSubscribe, getMountedSnapshot, getServerSnapshot);
  const [chosen, setChosen] = useState<string | null>(null);
  const size = chosen ?? (mounted ? readTextSize() : DEFAULT_TEXT_SIZE);

  function choose(id: string) {
    setChosen(id);
    applyTextSize(id);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Text size</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Just for this device — some phones read better a little smaller or larger than the shop&apos;s default. Everyone else keeps their own choice.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {TEXT_SIZES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => choose(t.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors",
                size === t.id ? "border-primary bg-primary/5" : "hover:bg-muted"
              )}
              aria-pressed={size === t.id}
            >
              <span className="relative flex size-8 items-center justify-center rounded-full bg-muted" style={{ fontSize: `${14 * t.scale}px` }}>
                Aa
                {size === t.id && <Check className="absolute -right-1 -top-1 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" strokeWidth={3} />}
              </span>
              <span className="text-xs font-medium">{t.name}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
