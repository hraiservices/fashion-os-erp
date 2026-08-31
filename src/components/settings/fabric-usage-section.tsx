"use client";

import { useState } from "react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_RATES } from "@/lib/business-rules";
import { DEFAULT_FABRIC_USAGE } from "@/lib/fabric-usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberInput } from "@/components/ui/number-input";
import { Skeleton } from "@/components/ui/skeleton";

type FabricUsage = Record<string, number>;

/** Meters of fabric per garment type — feeds the order form's fabric-requirement estimate.
 *  Deliberately keyed off the Rate Card's own garment types (added just above) rather than a
 *  separately-managed list, so the two never drift out of sync with each other. */
export function FabricUsageSection() {
  const { data: rates, isLoading: ratesLoading } = useAppSetting<Record<string, unknown>>("rates", DEFAULT_RATES);
  const { data: usage, isLoading: usageLoading, save } = useAppSetting<FabricUsage>("fabricUsage", DEFAULT_FABRIC_USAGE);

  const [draft, setDraft] = useState<FabricUsage | null>(null);
  useSyncFromSource(usage, (u) => {
    if (u && !draft) setDraft(u);
  });

  const current = draft || DEFAULT_FABRIC_USAGE;
  const garmentTypes = Object.keys(rates || DEFAULT_RATES);

  function update(type: string, value: number) {
    setDraft((d) => ({ ...(d || DEFAULT_FABRIC_USAGE), [type]: value }));
  }

  function commit() {
    if (draft) save.mutate(draft);
  }

  if (ratesLoading || usageLoading || !draft) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Fabric usage per garment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Typical meters of fabric per unit, at a standard adult size — used to estimate fabric needed on a new order. Leave at 0 for a garment type
          that isn&apos;t fabric-consuming (e.g. a saree fall/piko service).
        </p>
        {garmentTypes.map((type) => (
          <div key={type} className="grid grid-cols-12 items-center gap-2 border-b pb-2">
            <div className="col-span-8 font-medium">{type}</div>
            <NumberInput className="col-span-4" min={0} step={0.25} value={current[type] ?? 0} onChange={(v) => update(type, v)} onBlur={commit} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
