"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_FONT_CONFIG, GOOGLE_FONTS, FONT_WEIGHTS, FONT_SIZES, googleFontUrl, type FontConfig } from "@/lib/fonts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/** Shop-wide font picker — family, weight, and base size — saved to app_settings. */
export function FontSection() {
  const { data, isLoading, save } = useAppSetting<FontConfig>("font", DEFAULT_FONT_CONFIG);
  const [cfg, setCfg] = useState<FontConfig>(DEFAULT_FONT_CONFIG);

  useEffect(() => {
    if (data) setCfg(data);
  }, [data]);

  // Load the font being previewed (may differ from the saved one) so the sample below
  // renders correctly before hitting Save.
  const previewLink = googleFontUrl(cfg.family, cfg.weight);

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
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Font</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href={previewLink} />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Font family</Label>
            <Select value={cfg.family} onValueChange={(v) => v && setCfg({ ...cfg, family: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOOGLE_FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            Stitching Manager Pro — Order SOR-2AB97E0 for Hims, ₹1,400 total, balance due ₹0.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={onSave} disabled={save.isPending}>
            Save & apply
          </Button>
          <Button variant="outline" onClick={onReset}>
            Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
