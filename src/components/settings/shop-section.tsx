"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { fileToDataUrl } from "@/lib/image-utils";
import { DEFAULT_SHOP_CONFIG, type ShopConfig } from "@/hooks/use-shop-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** SettingsView section === "shop", Stitching_Manager_Pro_v16.html ~line 12597. */
export function ShopSection() {
  const { data, isLoading, save } = useAppSetting<ShopConfig>("shop", DEFAULT_SHOP_CONFIG);
  const [shop, setShop] = useState<ShopConfig>(DEFAULT_SHOP_CONFIG);

  useSyncFromSource(data, (d) => {
    if (d) setShop(d);
  });

  async function onSave() {
    try {
      await save.mutateAsync(shop);
      toast.success("Company settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file, 300);
      setShop((s) => ({ ...s, logoDataUrl: dataUrl }));
    } catch {
      toast.error("Could not read image");
    }
  }

  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      // Small — a favicon is only ever shown a few pixels wide.
      const dataUrl = await fileToDataUrl(file, 64);
      setShop((s) => ({ ...s, faviconDataUrl: dataUrl }));
    } catch {
      toast.error("Could not read image");
    }
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Company information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Company logo</Label>
          <div className="flex items-center gap-3">
            {shop.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logoDataUrl} alt="Company logo" className="size-14 rounded-lg border bg-white object-contain" />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-lg border text-[10px] text-muted-foreground">None</div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" nativeButton={false} render={<label className="cursor-pointer" />}>
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </Button>
              {shop.logoDataUrl && (
                <Button variant="ghost" size="sm" onClick={() => setShop((s) => ({ ...s, logoDataUrl: null }))}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Shown on the dashboard. Invoice PDF logos are set separately under Settings → Invoice Template.</p>
        </div>
        <div className="space-y-2">
          <Label>Favicon</Label>
          <div className="flex items-center gap-3">
            {shop.faviconDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.faviconDataUrl} alt="Favicon" className="size-14 rounded-lg border bg-white object-contain p-1" />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-lg border text-[10px] text-muted-foreground">None</div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" nativeButton={false} render={<label className="cursor-pointer" />}>
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={handleFaviconUpload} />
              </Button>
              {shop.faviconDataUrl && (
                <Button variant="ghost" size="sm" onClick={() => setShop((s) => ({ ...s, faviconDataUrl: null }))}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Shown as the browser tab icon. A simple square image works best — falls back to the company logo above when not set.</p>
        </div>
        <div className="space-y-2">
          <Label>Company name</Label>
          <Input value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Phone (shown in WhatsApp messages)</Label>
          <Input value={shop.phone} onChange={(e) => setShop({ ...shop, phone: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Business address (shown on invoices)</Label>
          <Input value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} placeholder="Shop no., street, city, pincode…" />
        </div>
        <div className="space-y-2">
          <Label>GSTIN (shown on invoices)</Label>
          <Input value={shop.gstin} onChange={(e) => setShop({ ...shop, gstin: e.target.value })} placeholder="e.g. 09ABCDE1234F1Z5" className="uppercase" />
        </div>
        <div className="space-y-2">
          <Label>Website URL (shown in WhatsApp messages, optional)</Label>
          <Input value={shop.websiteUrl} onChange={(e) => setShop({ ...shop, websiteUrl: e.target.value })} placeholder="https://yourcompany.com" />
        </div>
        <div className="space-y-2">
          <Label>Google review link (shown after delivery, optional)</Label>
          <Input value={shop.reviewUrl} onChange={(e) => setShop({ ...shop, reviewUrl: e.target.value })} placeholder="https://g.page/r/..." />
        </div>
        <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" disabled={save.isPending} onClick={onSave}>
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}
