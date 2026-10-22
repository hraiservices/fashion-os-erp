"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { fileToDataUrl } from "@/lib/image-utils";
import { BUILTIN_CARD_HEADER_BG_URL, DEFAULT_CARD_HEADER_BG_CONFIG, resolveCardHeaderBgUrl, type CardHeaderBgConfig } from "@/lib/card-header-bg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The faint illustration shown behind the Dashboard greeting and every page's title bar. Ships
 *  with a default (BUILTIN_CARD_HEADER_BG_URL); an admin can swap it for their own image or turn
 *  it off here. Same "upload → Storage → public URL" flow as the company logo (not a raw base64
 *  data URL in app_settings), since this one setting is fetched on every single page. */
export function CardHeaderBgSection() {
  const { data, isLoading, save } = useAppSetting<CardHeaderBgConfig>("cardHeaderBg", DEFAULT_CARD_HEADER_BG_CONFIG);
  const [cfg, setCfg] = useState<CardHeaderBgConfig>(DEFAULT_CARD_HEADER_BG_CONFIG);
  const [uploading, setUploading] = useState(false);

  useSyncFromSource(data, (d) => {
    if (d) setCfg(d);
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file, 600);
      const res = await fetch("/api/settings/branding-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "cardHeaderBg", dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      const next: CardHeaderBgConfig = { enabled: true, imageUrl: json.url as string };
      setCfg(next);
      await save.mutateAsync(next);
      toast.success("Header background updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload image");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    const next: CardHeaderBgConfig = { enabled: false, imageUrl: null };
    setCfg(next);
    try {
      await save.mutateAsync(next);
      toast.success("Header background removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleRestoreDefault() {
    const next: CardHeaderBgConfig = { enabled: true, imageUrl: null };
    setCfg(next);
    try {
      await save.mutateAsync(next);
      toast.success("Restored the default background");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const previewUrl = resolveCardHeaderBgUrl(cfg);
  const isCustom = !!cfg.imageUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Page header background</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">A faint repeating illustration shown behind the Dashboard greeting and every page&apos;s title bar.</p>

        <div className="flex items-center gap-3">
          <div
            className={cn("h-16 w-24 shrink-0 rounded-lg border bg-card bg-repeat", !cfg.enabled && "opacity-30")}
            style={{ backgroundImage: `url(${previewUrl})`, backgroundSize: "60px 60px" }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={uploading} nativeButton={false} render={<label className="cursor-pointer" />}>
              {uploading ? "Uploading…" : "Upload a replacement"}
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </Button>
            {isCustom && (
              <Button variant="ghost" size="sm" onClick={handleRestoreDefault} disabled={save.isPending}>
                Restore default
              </Button>
            )}
            {cfg.enabled && (
              <Button variant="ghost" size="sm" onClick={handleRemove} disabled={save.isPending}>
                Remove
              </Button>
            )}
            {!cfg.enabled && (
              <Button
                variant="outline"
                size="sm"
                disabled={save.isPending}
                onClick={async () => {
                  const next: CardHeaderBgConfig = { enabled: true, imageUrl: cfg.imageUrl };
                  setCfg(next);
                  try {
                    await save.mutateAsync(next);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to save");
                  }
                }}
              >
                <Check className="size-3.5" /> Turn back on
              </Button>
            )}
          </div>
        </div>
        {!isCustom && cfg.enabled && <p className="text-xs text-muted-foreground">Using the default — {BUILTIN_CARD_HEADER_BG_URL.split("/").pop()}</p>}
      </CardContent>
    </Card>
  );
}
