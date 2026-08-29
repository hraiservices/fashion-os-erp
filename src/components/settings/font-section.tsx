"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_FONT_CONFIG, GOOGLE_FONTS, FONT_WEIGHTS, FONT_SIZES, CUSTOM_FONT_VALUE, googleFontUrl, type FontConfig } from "@/lib/fonts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/** Shop-wide font picker — family, weight, and base size — saved to app_settings. */
export function FontSection() {
  const { data, isLoading, save } = useAppSetting<FontConfig>("font", DEFAULT_FONT_CONFIG);
  const [cfg, setCfg] = useState<FontConfig>(DEFAULT_FONT_CONFIG);
  // A saved family outside the curated list means it was typed in manually — keep the
  // "type your own" input showing instead of silently falling back to the dropdown.
  const [useCustom, setUseCustom] = useState(false);

  useSyncFromSource(data, (d) => {
    if (d) {
      setCfg(d);
      setUseCustom(!(GOOGLE_FONTS as readonly string[]).includes(d.family));
    }
  });

  // Load the font being previewed (may differ from the saved one) so the sample below
  // renders correctly before hitting Save.
  const previewLink = cfg.family.trim() ? googleFontUrl(cfg.family, cfg.weight) : null;

  async function onSave() {
    try {
      await save.mutateAsync(cfg);
      toast.success("Font saved and applied for everyone");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save font");
    }
  }

  function onReset() {
    setCfg(DEFAULT_FONT_CONFIG);
    setUseCustom(false);
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Font</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {previewLink && <link rel="stylesheet" href={previewLink} />}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Font family</Label>
            <Select
              value={useCustom ? CUSTOM_FONT_VALUE : cfg.family}
              onValueChange={(v) => {
                if (!v) return;
                if (v === CUSTOM_FONT_VALUE) {
                  setUseCustom(true);
                } else {
                  setUseCustom(false);
                  setCfg({ ...cfg, family: v });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOOGLE_FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_FONT_VALUE}>Other (type a Google Font name)…</SelectItem>
              </SelectContent>
            </Select>
            {useCustom && (
              <Input
                value={cfg.family}
                onChange={(e) => setCfg({ ...cfg, family: e.target.value })}
                placeholder="Exact name from fonts.google.com, e.g. Fraunces"
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Weight</Label>
            <Select value={String(cfg.weight)} onValueChange={(v) => v && setCfg({ ...cfg, weight: parseInt(v, 10) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_WEIGHTS.map((w) => (
                  <SelectItem key={w} value={String(w)}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Base size</Label>
            <Select value={String(cfg.size)} onValueChange={(v) => v && setCfg({ ...cfg, size: parseInt(v, 10) })}>
              <SelectTrigger>
                <SelectValue>{(v) => `${v}px`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}px
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Preview</div>
          <p style={{ fontFamily: `"${cfg.family}", sans-serif`, fontWeight: cfg.weight, fontSize: cfg.size }}>
            Fashion Flow — Order SOR-2AB97E0 for Hims, ₹1,400 total, balance due ₹0.
          </p>
        </div>

        <div className="flex gap-2">
          <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={onSave} disabled={save.isPending || !cfg.family.trim()}>
            Save & apply
          </Button>
          <Button variant="outline" className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={onReset}>
            Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
