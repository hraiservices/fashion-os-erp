"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_RATES, type RateCard } from "@/lib/business-rules";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Pencil, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Same 4 columns everywhere a garment-type rate is edited (customer rate card, tailor payable
 *  rate card): a price per lining tier for new stitching, plus one alteration price that does
 *  NOT vary by lining. */
export const RATE_COLUMNS: { key: "s" | "h" | "f" | "alteration"; label: string }[] = [
  { key: "s", label: "No Lining" },
  { key: "h", label: "Half Lining" },
  { key: "f", label: "Full Lining" },
  { key: "alteration", label: "Alteration" },
];

/** Renames a garment type everywhere it's used as a plain string key — see
 *  rename_garment_type() in add_rename_garment_type_rpc.sql for the full cascade (rate card,
 *  fabric usage, every tailor payable rate version, and every existing order's garments). */
function useRenameGarmentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ oldType, newType }: { oldType: string; newType: string }) => {
      const res = await fetch("/api/settings/garment-types/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldType, newType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rename failed");
      return data as { ordersUpdated: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-setting", "rates"] });
      qc.invalidateQueries({ queryKey: ["app-setting", "fabricUsage"] });
      qc.invalidateQueries({ queryKey: ["tailor-rate-versions"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function RenameGarmentDialog({ type, open, onOpenChange }: { type: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState(type);
  const rename = useRenameGarmentType();

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === type) return onOpenChange(false);
    try {
      const { ordersUpdated } = await rename.mutateAsync({ oldType: type, newType: trimmed });
      toast.success(`Renamed "${type}" to "${trimmed}"${ordersUpdated > 0 ? ` — updated ${ordersUpdated} existing order(s)` : ""}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename garment type");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setName(type); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename &quot;{type}&quot;</DialogTitle>
          <DialogDescription>
            Updates the rate card, fabric usage, every tailor payable rate version, and the garment type saved on every existing order that uses this name.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>New garment type name</Label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={rename.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={rename.isPending || !name.trim()}>
            {rename.isPending ? "Renaming…" : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Customer-facing rate card — one row per garment type, one column per lining tier (No/Half/Full)
 *  plus a single Alteration price (an alteration doesn't vary by lining — it's priced by the work
 *  done, not by how the original garment was lined). See Tailor Payable Rates below for the
 *  matching payout side of this same rate card. */
export function RatesSection() {
  const { data: rates, isLoading, save } = useAppSetting<RateCard>("rates", DEFAULT_RATES);
  const [newType, setNewType] = useState("");
  const [newRate, setNewRate] = useState({ s: 0, h: 0, f: 0, alteration: 0 });
  const [renamingType, setRenamingType] = useState<string | null>(null);

  // Local editable copy, seeded once from the server value — typing only updates this, never
  // fires a save, so a keystroke can't be lost or flicker while a previous save is still in
  // flight. The actual save fires on blur (see commit() below), not per keystroke.
  const [draft, setDraft] = useState<RateCard | null>(null);
  useSyncFromSource(rates, (r) => {
    if (r && !draft) setDraft(r);
  });

  const current = draft || DEFAULT_RATES;

  function updateRate(type: string, column: (typeof RATE_COLUMNS)[number]["key"], value: number) {
    setDraft((d) => {
      const base = d || DEFAULT_RATES;
      return { ...base, [type]: { ...base[type], [column]: value } };
    });
  }

  function commit() {
    if (draft) save.mutate(draft);
  }

  async function addGarment() {
    if (!newType.trim()) return;
    try {
      const updated = { ...current, [newType.trim()]: newRate };
      await save.mutateAsync(updated);
      setDraft(updated);
      setNewType("");
      setNewRate({ s: 0, h: 0, f: 0, alteration: 0 });
      toast.success("Garment type added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add garment type");
    }
  }

  async function removeGarment(type: string) {
    if (Object.keys(current).length <= 1) {
      toast.error("Keep at least 1 garment type");
      return;
    }
    const updated = { ...current };
    delete updated[type];
    await save.mutateAsync(updated);
    setDraft(updated);
  }

  if (isLoading || !draft) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Customer rate card</CardTitle>
        <CardDescription>What you charge the customer, per garment type — a price for each lining tier, plus one alteration price.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="hidden grid-cols-12 gap-2 px-1 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
          <div className="col-span-3">Garment type</div>
          {RATE_COLUMNS.map((c) => (
            <div key={c.key} className="col-span-2 text-center">
              {c.label}
            </div>
          ))}
          <div className="col-span-1" />
        </div>

        <div className="divide-y">
          {Object.entries(current).map(([type, rate]) => (
            <div key={type} className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-12 sm:items-center sm:gap-2 sm:py-2">
              <div className="col-span-2 flex items-center gap-1.5 font-medium sm:col-span-3">
                <span className="truncate">{type}</span>
                <button type="button" onClick={() => setRenamingType(type)} aria-label={`Rename ${type}`} title={`Rename ${type}`} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <Pencil className="size-3.5" />
                </button>
              </div>
              {RATE_COLUMNS.map((c) => (
                <div key={c.key} className="space-y-1 sm:col-span-2">
                  <Label className="text-[10px] text-muted-foreground sm:hidden">{c.label}</Label>
                  <NumberInput min={0} value={rate[c.key]} onChange={(v) => updateRate(type, c.key, v)} onBlur={commit} />
                </div>
              ))}
              <div className="col-span-2 flex justify-end sm:col-span-1">
                <Button variant="ghost" size="sm" onClick={() => removeGarment(type)} aria-label={`Remove ${type}`}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-12 sm:items-end">
          <div className="col-span-2 space-y-1 sm:col-span-3">
            <Label className="text-[10px] text-muted-foreground">New garment type</Label>
            <Input placeholder="e.g. Kurta" value={newType} onChange={(e) => setNewType(e.target.value)} />
          </div>
          {RATE_COLUMNS.map((c) => (
            <div key={c.key} className="space-y-1 sm:col-span-2">
              <Label className="text-[10px] text-muted-foreground">{c.label}</Label>
              <NumberInput min={0} value={newRate[c.key]} onChange={(v) => setNewRate((r) => ({ ...r, [c.key]: v }))} />
            </div>
          ))}
          <div className="col-span-2 sm:col-span-1">
            <Button className="w-full" onClick={addGarment}>
              Add
            </Button>
          </div>
        </div>
      </CardContent>

      {renamingType && <RenameGarmentDialog type={renamingType} open={!!renamingType} onOpenChange={(v) => !v && setRenamingType(null)} />}
    </Card>
  );
}
