"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_RATES, DEFAULT_TAILOR_RATES, type TailorRateCard } from "@/lib/business-rules";
import { RATE_COLUMNS } from "@/components/settings/rates-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker, toISODate } from "@/components/ui/date-picker";
import { fmtDate } from "@/lib/format";

type RateVersion = {
  id: string;
  rates: TailorRateCard;
  effectiveFrom: string;
  createdBy: string | null;
  createdAt: string;
  isPending: boolean;
};

/** What a tailor is paid per garment — separate from (and payroll-manager-only, unlike) the
 *  customer-facing rate card, but the same 4 columns (No/Half/Full Lining + one lining-independent
 *  Alteration payout). Garment-type rows always mirror the customer rate card's keys
 *  (Object.keys(rates)), so every priced garment type is guaranteed a tailor rate too.
 *  Writes go through /api/settings/tailor-rates (managePayroll-gated), not a plain
 *  app_settings upsert — the DB additionally blocks direct writes to this key, see
 *  add_tailor_rates_lockdown.sql.
 *
 *  A change here is versioned, not applied silently on blur (add_tailor_rate_versions.sql):
 *  editing cells only updates the local draft; "Apply changes" asks for the date the new rates
 *  take effect, then saves a new version. Every order not yet frozen (not yet "ready" and not
 *  yet payroll-confirmed) picks up whichever version is current as of today automatically — see
 *  current_tailor_rates() — the moment that date arrives, with no separate step needed. Full
 *  history of every change, including any still-pending one, is listed below the table. */
export function TailorRatesSection() {
  const qc = useQueryClient();
  const { data: customerRates, isLoading: customerLoading } = useAppSetting("rates", DEFAULT_RATES);

  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: ["tailor-rate-versions"],
    queryFn: async (): Promise<RateVersion[]> => {
      const res = await fetch("/api/settings/tailor-rates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load tailor rate history");
      return data.versions;
    },
  });

  const versions = versionsData || [];
  const current = versions.find((v) => !v.isPending) || null;
  const pending = versions.find((v) => v.isPending) || null;
  const currentRates: TailorRateCard = current?.rates || DEFAULT_TAILOR_RATES;

  // Local editable copy, seeded once from the current version. Typing only updates this — never
  // fires a network call — so keystrokes can't be lost while the dialog/save is pending.
  const [draft, setDraft] = useState<TailorRateCard | null>(null);
  useSyncFromSource(current, (v) => {
    if (v && !draft) setDraft(v.rates);
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(() => toISODate(new Date()));

  const save = useMutation({
    mutationFn: async ({ rates, effectiveFrom }: { rates: TailorRateCard; effectiveFrom: string }) => {
      const res = await fetch("/api/settings/tailor-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates, effectiveFrom }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      return effectiveFrom;
    },
    onSuccess: (effectiveFrom) => {
      qc.invalidateQueries({ queryKey: ["tailor-rate-versions"] });
      qc.invalidateQueries({ queryKey: ["current-tailor-rates"] });
      const today = toISODate(new Date());
      toast.success(effectiveFrom <= today ? "Tailor rates updated — already in effect." : `Tailor rates scheduled to take effect ${fmtDate(effectiveFrom)}.`);
      setConfirmOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (customerLoading || versionsLoading || !draft) return <Skeleton className="h-64 w-full" />;

  const garmentTypes = Object.keys(customerRates || DEFAULT_RATES);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(currentRates);

  function updateRate(type: string, column: (typeof RATE_COLUMNS)[number]["key"], value: number) {
    setDraft((d) => {
      const base = d || DEFAULT_TAILOR_RATES;
      const row = base[type] || { s: 0, h: 0, f: 0, alteration: 0 };
      return { ...base, [type]: { ...row, [column]: value } };
    });
  }

  function openConfirm() {
    setEffectiveFrom(toISODate(new Date()));
    setConfirmOpen(true);
  }

  function applyChanges() {
    if (!draft || !effectiveFrom) return;
    save.mutate({ rates: draft, effectiveFrom });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tailor payable rates</CardTitle>
        <CardDescription>
          What each tailor earns per garment. A change here applies to every order not yet marked &quot;ready&quot; or confirmed for payroll, starting the
          date you choose below — orders already frozen keep their original rate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            A rate change is scheduled to take effect on <strong>{fmtDate(pending.effectiveFrom)}</strong>. Applying a new change now will replace it.
          </div>
        )}

        <div className="space-y-1">
          <div className="hidden grid-cols-12 gap-2 px-1 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <div className="col-span-4">Garment type</div>
            {RATE_COLUMNS.map((c) => (
              <div key={c.key} className="col-span-2 text-center">
                {c.label}
              </div>
            ))}
          </div>

          <div className="divide-y">
            {garmentTypes.map((type) => {
              const row = draft[type] || { s: 0, h: 0, f: 0, alteration: 0 };
              return (
                <div key={type} className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-12 sm:items-center sm:py-2">
                  <div className="col-span-2 font-medium sm:col-span-4">{type}</div>
                  {RATE_COLUMNS.map((c) => (
                    <div key={c.key} className="space-y-1 sm:col-span-2">
                      <Label className="text-[10px] text-muted-foreground sm:hidden">{c.label}</Label>
                      <NumberInput min={0} value={row[c.key]} onChange={(v) => updateRate(type, c.key, v)} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <p className="text-[11px] text-muted-foreground">Add garment types in the Customer rate card above first — this list always mirrors it.</p>
          <Button size="sm" disabled={!isDirty} onClick={openConfirm}>
            Apply changes
          </Button>
        </div>

        {versions.length > 1 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Rate history</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {versions.map((v) => (
                <li key={v.id}>
                  {v.isPending ? "Scheduled for " : "Effective "}
                  {fmtDate(v.effectiveFrom)}
                  {v === current && " (current)"}
                  {v.createdBy ? ` — set by ${v.createdBy}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select the date from which these updates will apply</DialogTitle>
            <DialogDescription>
              Every order not yet marked &quot;ready&quot; or confirmed for payroll will use these new rates starting this date. Choose today to apply
              immediately, or a future date to schedule it — only one scheduled change can be pending at a time.
            </DialogDescription>
          </DialogHeader>
          <DatePicker value={effectiveFrom} onChange={setEffectiveFrom} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={applyChanges} disabled={save.isPending || !effectiveFrom}>
              {save.isPending ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
