"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_LOYALTY_CONFIG, type LoyaltyConfig } from "@/lib/business-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** LoyaltySection(), Stitching_Manager_Pro_v16.html ~line 13330. */
export function LoyaltySection() {
  const { data, isLoading, save } = useAppSetting<LoyaltyConfig>("loyalty", DEFAULT_LOYALTY_CONFIG);
  const [lc, setLc] = useState<LoyaltyConfig>(DEFAULT_LOYALTY_CONFIG);

  useSyncFromSource(data, (d) => {
    if (d) setLc(d);
  });

  async function onSave() {
    try {
      await save.mutateAsync(lc);
      toast.success("Loyalty settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  function field(key: keyof LoyaltyConfig) {
    return {
      value: lc[key] as number,
      onChange: (v: number) => setLc({ ...lc, [key]: v }),
    };
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Loyalty program</CardTitle>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lc.enabled} onChange={(e) => setLc({ ...lc, enabled: e.target.checked })} />
            Enabled
          </label>
        </CardHeader>
        {lc.enabled && (
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Points earned per ₹100 spent</Label>
              <NumberInput min={1} {...field("earnPer100")} />
            </div>
            <div className="space-y-2">
              <Label>Bonus pts on new order</Label>
              <NumberInput min={0} {...field("orderBonus")} />
            </div>
            <div className="space-y-2">
              <Label>Bonus pts on delivery</Label>
              <NumberInput min={0} {...field("deliveryBonus")} />
            </div>
            <div className="space-y-2">
              <Label>₹ discount per 100 pts redeemed</Label>
              <NumberInput min={1} {...field("redeemPer100pts")} />
            </div>
            <div className="space-y-2">
              <Label>Minimum pts to redeem</Label>
              <NumberInput min={0} {...field("minRedeem")} />
            </div>
          </CardContent>
        )}
        <CardContent className="pt-0">
          <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={onSave} disabled={save.isPending}>
            Save settings
          </Button>
        </CardContent>
      </Card>

      {lc.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tier thresholds</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div className="rounded-md bg-amber-50 p-3">
              <div className="text-xs font-medium text-amber-800">Bronze</div>
              <div className="text-xs text-amber-700">0 pts onwards</div>
            </div>
            <div className="space-y-1 rounded-md bg-slate-50 p-3">
              <Label className="text-xs">Silver from</Label>
              <NumberInput min={1} {...field("tierSilver")} />
            </div>
            <div className="space-y-1 rounded-md bg-amber-50 p-3">
              <Label className="text-xs">Gold from</Label>
              <NumberInput min={1} {...field("tierGold")} />
            </div>
            <div className="col-span-3 space-y-1 rounded-md bg-zinc-100 p-3">
              <Label className="text-xs">Platinum from</Label>
              <NumberInput min={1} className="max-w-40" {...field("tierPlatinum")} />
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" onClick={onSave} disabled={save.isPending}>
              Save tiers
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
