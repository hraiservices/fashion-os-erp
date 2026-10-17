"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_SHOP_LINKS, SHOP_LINKS_KEY, isValidUpiId, type ShopLinks } from "@/lib/shop-links";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** The UPI ID customers pay to and the Google review link sent after delivery. */
export function ShopLinksSection() {
  const { data, isLoading, save } = useAppSetting<ShopLinks>(SHOP_LINKS_KEY, DEFAULT_SHOP_LINKS);
  const [draft, setDraft] = useState<ShopLinks | null>(null);

  useSyncFromSource(data, (v) => {
    if (v && !draft) setDraft(v);
  });

  if (isLoading || !draft) return <Skeleton className="h-64 w-full" />;
  const d = draft;

  async function onSave() {
    if (d.upiId.trim() && !isValidUpiId(d.upiId)) return toast.error("That UPI ID doesn't look right — it should look like shopname@bank");
    try {
      await save.mutateAsync({ upiId: d.upiId.trim(), upiName: d.upiName.trim() });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>UPI payments</CardTitle>
        <CardDescription>The UPI QR on orders and invoices uses this ID. Customers pay you directly; you mark the payment received yourself.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Shop UPI ID</Label>
          <Input value={d.upiId} onChange={(e) => setDraft({ ...d, upiId: e.target.value })} placeholder="shopname@bank" autoCapitalize="none" className="h-11" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Name shown to the customer when they pay</Label>
          <Input value={d.upiName} onChange={(e) => setDraft({ ...d, upiName: e.target.value })} placeholder="Your boutique name" className="h-11" />
        </div>
        <Button className="h-12 px-6 text-base sm:h-9 sm:px-4 sm:text-sm" disabled={save.isPending} onClick={onSave}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
