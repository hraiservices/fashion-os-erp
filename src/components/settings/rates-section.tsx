"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_RATES, type Lining } from "@/lib/business-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Pencil, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type RateCard = Record<string, Record<Lining, number>>;
const LININGS: Lining[] = ["s", "h", "f"];

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

function RenameGarmentDialog({ type, open, onOpenChange }: { type: string; open: boolean; onOpenChange: (open: boolean) => void }) {
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

/** SettingsView section === "rates", Stitching_Manager_Pro_v16.html ~line 12842. */
export function RatesSection() {
  const { data: rates, isLoading, save } = useAppSetting<RateCard>("rates", DEFAULT_RATES);
  const [newType, setNewType] = useState("");
  const [newS, setNewS] = useState(0);
  const [newH, setNewH] = useState(0);
  const [newF, setNewF] = useState(0);
  const [renamingType, setRenamingType] = useState<string | null>(null);

  // Local editable copy, seeded once from the server value — typing only updates this, never
  // fires a save, so a keystroke can't be lost or flicker while a previous save is still in
  // flight. The actual save fires on blur (see commit() below), not per keystroke.
  const [draft, setDraft] = useState<RateCard | null>(null);
  useSyncFromSource(rates, (r) => {
    if (r && !draft) setDraft(r);
  });

  const current = draft || DEFAULT_RATES;

  function updateRate(type: string, lining: Lining, value: number) {
    setDraft((d) => {
      const base = d || DEFAULT_RATES;
      return { ...base, [type]: { ...base[type], [lining]: value } };
    });
  }

  function commit() {
    if (draft) save.mutate(draft);
  }

  async function addGarment() {
    if (!newType.trim()) return;
    try {
      const updated = { ...current, [newType.trim()]: { s: newS, h: newH, f: newF } };
      await save.mutateAsync(updated);
      setDraft(updated);
      setNewType("");
      setNewS(0);
      setNewH(0);
      setNewF(0);
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
        <CardTitle className="text-sm">Rate card</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(current).map(([type, rate]) => (
          <div key={type} className="grid grid-cols-12 items-center gap-2 border-b pb-2">
            <div className="col-span-4 flex items-center gap-1.5 font-medium">
              <span className="truncate">{type}</span>
              <button type="button" onClick={() => setRenamingType(type)} aria-label={`Rename ${type}`} title={`Rename ${type}`} className="shrink-0 text-muted-foreground hover:text-foreground">
                <Pencil className="size-3.5" />
              </button>
            </div>
            {LININGS.map((l) => (
              <NumberInput
                key={l}
                className="col-span-2"
                min={0}
                value={rate[l]}
                onChange={(v) => updateRate(type, l, v)}
                onBlur={commit}
              />
            ))}
            <Button variant="ghost" size="sm" className="col-span-2" onClick={() => removeGarment(type)}><X className="size-4" /></Button>
          </div>
        ))}

        <div className="grid grid-cols-12 items-center gap-2 pt-2">
          <Input className="col-span-4" placeholder="New garment type" value={newType} onChange={(e) => setNewType(e.target.value)} />
          <NumberInput className="col-span-2" placeholder="No Lining" value={newS} onChange={setNewS} />
          <NumberInput className="col-span-2" placeholder="Half" value={newH} onChange={setNewH} />
          <NumberInput className="col-span-2" placeholder="Full" value={newF} onChange={setNewF} />
          <Button className="col-span-2" onClick={addGarment}>
            Add
          </Button>
        </div>
      </CardContent>

      {renamingType && <RenameGarmentDialog type={renamingType} open={!!renamingType} onOpenChange={(v) => !v && setRenamingType(null)} />}
    </Card>
  );
}
