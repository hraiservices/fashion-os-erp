"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DENSITY_MODES, DEFAULT_DENSITY } from "@/lib/density";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Shop-wide table density (comfortable/compact) — saved to app_settings, applied everywhere via
 *  the `density-compact` class ColorThemeLoader toggles on <html> (see the `[data-slot="table-*"]`
 *  rules in globals.css). */
export function DensitySection() {
  const { data, isLoading, save } = useAppSetting<string>("density", DEFAULT_DENSITY);
  const [density, setDensity] = useState(DEFAULT_DENSITY);

  useSyncFromSource(data, (d) => {
    if (d) setDensity(d);
  });

  function preview(id: string) {
    setDensity(id);
    document.documentElement.classList.toggle("density-compact", id === "compact");
  }

  async function onSave() {
    try {
      await save.mutateAsync(density);
      toast.success("Density saved and applied for everyone");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Density</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">Row height and padding for tables across the app.</p>
        <div className="grid grid-cols-2 gap-3">
          {DENSITY_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => preview(m.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors",
                density === m.id ? "border-primary bg-primary/5" : "hover:bg-muted"
              )}
              aria-pressed={density === m.id}
            >
              <span className="relative flex w-full flex-col gap-1 rounded-md border bg-background p-1.5">
                <span className={cn("rounded-sm bg-muted", m.id === "compact" ? "h-1.5" : "h-2.5")} />
                <span className={cn("rounded-sm bg-muted", m.id === "compact" ? "h-1.5" : "h-2.5")} />
                <span className={cn("rounded-sm bg-muted", m.id === "compact" ? "h-1.5" : "h-2.5")} />
                {density === m.id && <Check className="absolute -right-1 -top-1 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" strokeWidth={3} />}
              </span>
              <span className="text-xs font-medium">{m.name}</span>
            </button>
          ))}
        </div>
        <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={onSave} disabled={save.isPending}>
          Save & apply
        </Button>
      </CardContent>
    </Card>
  );
}
