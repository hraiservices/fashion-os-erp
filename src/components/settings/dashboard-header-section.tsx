"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_DASHBOARD_HEADER_CONFIG, type DashboardHeaderConfig } from "@/lib/dashboard-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const OPTIONS: { key: keyof DashboardHeaderConfig; label: string }[] = [
  { key: "showClock", label: "Live clock" },
  { key: "showDate", label: "Today's date" },
  { key: "showGlobe", label: "Rotating globe" },
  { key: "showFlag", label: "Country flag" },
];

/** Toggles the clock/date/globe/flag shown next to the Dashboard greeting. */
export function DashboardHeaderSection() {
  const { data, isLoading, save } = useAppSetting<DashboardHeaderConfig>("dashboardHeader", DEFAULT_DASHBOARD_HEADER_CONFIG);
  const [cfg, setCfg] = useState<DashboardHeaderConfig>(DEFAULT_DASHBOARD_HEADER_CONFIG);

  useEffect(() => {
    if (data) setCfg(data);
  }, [data]);

  function toggle(key: keyof DashboardHeaderConfig) {
    setCfg((c) => ({ ...c, [key]: !c[key] }));
  }

  async function onSave() {
    try {
      await save.mutateAsync(cfg);
      toast.success("Dashboard header saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Dashboard header</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">Choose what shows up next to the greeting on the Dashboard.</p>
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                cfg[key] ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={cfg[key]}
            >
              <span className={cn("flex size-4 items-center justify-center rounded-sm border", cfg[key] ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                {cfg[key] && <Check className="size-3" strokeWidth={3} />}
              </span>
              {label}
            </button>
          ))}
        </div>
        <Button onClick={onSave} disabled={save.isPending}>
          Save & apply
        </Button>
      </CardContent>
    </Card>
  );
}
