"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_RATES, DEFAULT_TAILOR_RATES, LINING_LABELS, type Lining, type TailorRateCard } from "@/lib/business-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberInput } from "@/components/ui/number-input";
import { Skeleton } from "@/components/ui/skeleton";

const LININGS: Lining[] = ["s", "h", "f"];

/** What a tailor is paid per garment — separate from (and payroll-manager-only, unlike) the
 *  customer-facing rate card. Garment-type rows always mirror the customer rate card's keys
 *  (Object.keys(rates)), so every priced garment type is guaranteed a tailor rate too.
 *  Writes go through /api/settings/tailor-rates (managePayroll-gated), not a plain
 *  app_settings upsert — the DB additionally blocks direct writes to this key, see
 *  add_tailor_rates_lockdown.sql. */
export function TailorRatesSection() {
  const qc = useQueryClient();
  const { data: customerRates, isLoading: customerLoading } = useAppSetting("rates", DEFAULT_RATES);
  const { data: rates, isLoading } = useAppSetting<TailorRateCard>("tailorRates", DEFAULT_TAILOR_RATES);

  // Local editable copy, seeded once from the server value. Typing only updates this — never
  // fires a network call — so keystrokes can't be lost or flicker while waiting on (or racing)
  // a save response. The actual save fires on blur (see commit() below).
  const [draft, setDraft] = useState<TailorRateCard | null>(null);
  useSyncFromSource(rates, (r) => {
    if (r && !draft) setDraft(r);
  });

  const save = useMutation({
    mutationFn: async (value: TailorRateCard) => {
      const res = await fetch("/api/settings/tailor-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      return value;
    },
    onSuccess: (value) => qc.setQueryData(["app-setting", "tailorRates"], value),
  });

  if (isLoading || customerLoading || !draft) return <Skeleton className="h-64 w-full" />;

  const garmentTypes = Object.keys(customerRates || DEFAULT_RATES);
  const current = draft;

  function updateRate(type: string, lining: Lining, column: "new" | "alteration", value: number) {
    setDraft((d) => {
      const base = d || DEFAULT_TAILOR_RATES;
      const row = base[type]?.[lining] || { new: 0, alteration: 0 };
      return { ...base, [type]: { ...base[type], [lining]: { ...row, [column]: value } } };
    });
  }

  function commit() {
    if (draft) save.mutate(draft);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Tailor payable rate card</CardTitle>
        <p className="text-xs text-muted-foreground">
          What each tailor earns per garment — snapshotted onto the order the moment it reaches &quot;ready&quot;, then frozen. A rate change here only affects garments finished after the change.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-12 gap-2 border-b pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <div className="col-span-3">Garment type</div>
          {LININGS.map((l) => (
            <div key={l} className="col-span-3 grid grid-cols-2 gap-1 text-center">
              <span className="col-span-2">{LINING_LABELS[l]}</span>
            </div>
          ))}
        </div>
        {garmentTypes.map((type) => (
          <div key={type} className="grid grid-cols-12 items-center gap-2 border-b pb-2">
            <div className="col-span-3 font-medium">{type}</div>
            {LININGS.map((l) => {
              const row = current[type]?.[l] || { new: 0, alteration: 0 };
              return (
                <div key={l} className="col-span-3 grid grid-cols-2 gap-1">
                  <NumberInput min={0} placeholder="New" value={row.new} onChange={(v) => updateRate(type, l, "new", v)} onBlur={commit} />
                  <NumberInput min={0} placeholder="Alt." value={row.alteration} onChange={(v) => updateRate(type, l, "alteration", v)} onBlur={commit} />
                </div>
              );
            })}
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">Each pair is New / Alteration. Add garment types under Settings → Rate card first — this list always mirrors it.</p>
      </CardContent>
    </Card>
  );
}
