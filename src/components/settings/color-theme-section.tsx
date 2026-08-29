"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { COLOR_THEMES, DEFAULT_COLOR_THEME, SIDEBAR_STYLES, DEFAULT_SIDEBAR_STYLE, CORNER_STYLES, DEFAULT_CORNER_STYLE } from "@/lib/color-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Representative bg/fg swatch for each sidebar style — "colored" shows violet as a stand-in since its real color is dynamic. */
const SIDEBAR_PREVIEW: Record<string, { bg: string; fg: string }> = {
  dark: { bg: "oklch(0.205 0.02 258)", fg: "oklch(0.929 0.005 258)" },
  black: { bg: "oklch(0.145 0 0)", fg: "oklch(0.929 0 0)" },
  light: { bg: "oklch(0.985 0 0)", fg: "oklch(0.205 0 0)" },
  colored: { bg: "oklch(0.32 0.09 292.717)", fg: "oklch(0.929 0.005 258)" },
};

/** Shop-wide accent color + sidebar style pickers — saved to app_settings, applied everywhere via ColorThemeLoader. */
export function ColorThemeSection() {
  const { data: colorData, isLoading: colorLoading, save: saveColor } = useAppSetting<string>("colorTheme", DEFAULT_COLOR_THEME);
  const { data: sidebarData, isLoading: sidebarLoading, save: saveSidebar } = useAppSetting<string>("sidebarStyle", DEFAULT_SIDEBAR_STYLE);
  const { data: cornerData, isLoading: cornerLoading, save: saveCorner } = useAppSetting<string>("cornerStyle", DEFAULT_CORNER_STYLE);
  const [selected, setSelected] = useState(DEFAULT_COLOR_THEME);
  const [sidebarSelected, setSidebarSelected] = useState(DEFAULT_SIDEBAR_STYLE);
  const [cornerSelected, setCornerSelected] = useState(DEFAULT_CORNER_STYLE);
  const [saving, setSaving] = useState(false);

  useSyncFromSource(colorData, (d) => {
    if (d) setSelected(d);
  });

  useSyncFromSource(sidebarData, (d) => {
    if (d) setSidebarSelected(d);
  });

  useSyncFromSource(cornerData, (d) => {
    if (d) setCornerSelected(d);
  });

  function preview(id: string) {
    setSelected(id);
    // Live-preview immediately, before saving — same theme-<id> class the loader uses.
    const root = document.documentElement;
    COLOR_THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`));
    root.classList.add(`theme-${id}`);
  }

  function previewSidebar(id: string) {
    setSidebarSelected(id);
    const root = document.documentElement;
    SIDEBAR_STYLES.forEach((s) => root.classList.remove(`sidebar-${s.id}`));
    root.classList.add(`sidebar-${id}`);
  }

  function previewCorner(id: string) {
    setCornerSelected(id);
    const radius = CORNER_STYLES.find((c) => c.id === id)?.radius;
    if (radius) document.documentElement.style.setProperty("--radius", radius);
  }

  async function onSave() {
    setSaving(true);
    try {
      await Promise.all([saveColor.mutateAsync(selected), saveSidebar.mutateAsync(sidebarSelected), saveCorner.mutateAsync(cornerSelected)]);
      toast.success("Appearance saved and applied for everyone");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save appearance");
    } finally {
      setSaving(false);
    }
  }

  if (colorLoading || sidebarLoading || cornerLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Color theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          {COLOR_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => preview(t.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors",
                selected === t.id ? "border-primary bg-primary/5" : "hover:bg-muted"
              )}
              aria-pressed={selected === t.id}
            >
              <span className="relative flex size-8 items-center justify-center rounded-full" style={{ background: t.swatch }}>
                {selected === t.id && <Check className="size-4 text-white" strokeWidth={3} />}
              </span>
              <span className="text-xs font-medium">{t.name}</span>
            </button>
          ))}
        </div>

        <div>
          <div className="mb-3 text-xs font-medium text-muted-foreground">Sidebar style</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SIDEBAR_STYLES.map((s) => {
              const p = SIDEBAR_PREVIEW[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => previewSidebar(s.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors",
                    sidebarSelected === s.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                  )}
                  aria-pressed={sidebarSelected === s.id}
                >
                  <span className="relative flex h-8 w-14 items-center justify-center rounded-md border" style={{ background: p.bg }}>
                    {sidebarSelected === s.id && <Check className="size-4" strokeWidth={3} style={{ color: p.fg }} />}
                  </span>
                  <span className="text-xs font-medium">{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-3 text-xs font-medium text-muted-foreground">Corner style</div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {CORNER_STYLES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => previewCorner(c.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors",
                  cornerSelected === c.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                )}
                aria-pressed={cornerSelected === c.id}
              >
                <span className="flex h-8 w-14 items-center justify-center border-2 border-foreground/40 bg-transparent" style={{ borderRadius: c.radius }} />
                <span className="text-xs font-medium">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Preview</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Primary button</Button>
            <Button size="sm" variant="outline">Outline button</Button>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Badge</span>
          </div>
        </div>

        <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={onSave} disabled={saving}>
          Save & apply
        </Button>
      </CardContent>
    </Card>
  );
}
