"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
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

  useEffect(() => {
    if (data) setShop(data);
  }, [data]);

  async function onSave() {
    try {
      await save.mutateAsync(shop);
      toast.success("Shop settings saved");
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

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Shop information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Shop logo</Label>
          <div className="flex items-center gap-3">
            {shop.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logoDataUrl} alt="Shop logo" className="size-14 rounded-lg border bg-white object-contain" />
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
          <Label>Shop name</Label>
          <Input value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Phone (shown in WhatsApp messages)</Label>
          <Input value={shop.phone} onChange={(e) => setShop({ ...shop, phone: e.target.value })} />
        </div>
        <Button disabled={save.isPending} onClick={onSave}>
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}
