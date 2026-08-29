"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const DEFAULT_THEME_MODE = "system";

const MODES = [
  { id: "light", name: "Light", icon: Sun },
  { id: "dark", name: "Dark", icon: Moon },
  { id: "system", name: "System", icon: Monitor },
] as const;

/** Shop-wide default light/dark/system mode for a device that hasn't made its own choice yet —
 *  saved to app_settings and applied by DefaultThemeLoader. Anyone can still flip the topbar's
 *  own light/dark toggle for themselves; that personal choice always wins from then on. */
export function ThemeModeSection() {
  const { data, isLoading, save } = useAppSetting<string>("defaultThemeMode", DEFAULT_THEME_MODE);
  const [mode, setMode] = useState(DEFAULT_THEME_MODE);

  useSyncFromSource(data, (d) => {
    if (d) setMode(d);
  });

  async function onSave() {
    try {
      await save.mutateAsync(mode);
      toast.success("Default theme saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Default theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Applies to a device that hasn&apos;t chosen light/dark for itself yet. Anyone can still switch it for themselves anytime from the topbar toggle.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors",
                mode === m.id ? "border-primary bg-primary/5" : "hover:bg-muted"
              )}
              aria-pressed={mode === m.id}
            >
              <span className="relative flex size-8 items-center justify-center rounded-full bg-muted">
                <m.icon className="size-4" />
                {mode === m.id && <Check className="absolute -right-1 -top-1 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" strokeWidth={3} />}
              </span>
              <span className="text-xs font-medium">{m.name}</span>
            </button>
          ))}
        </div>
        <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={onSave} disabled={save.isPending}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
