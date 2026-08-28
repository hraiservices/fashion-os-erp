"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_RATES, type Lining } from "@/lib/business-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type RateCard = Record<string, Record<Lining, number>>;
const LININGS: Lining[] = ["s", "h", "f"];

/** SettingsView section === "rates", Stitching_Manager_Pro_v16.html ~line 12842. */
export function RatesSection() {
  const { data: rates, isLoading, save } = useAppSetting<RateCard>("rates", DEFAULT_RATES);
  const [newType, setNewType] = useState("");
  const [newS, setNewS] = useState(0);
  const [newH, setNewH] = useState(0);
  const [newF, setNewF] = useState(0);

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
            <div className="col-span-4 font-medium">{type}</div>
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
          <NumberInput className="col-span-2" placeholder="Simple" value={newS} onChange={setNewS} />
          <NumberInput className="col-span-2" placeholder="Half" value={newH} onChange={setNewH} />
          <NumberInput className="col-span-2" placeholder="Full" value={newF} onChange={setNewF} />
          <Button className="col-span-2" onClick={addGarment}>
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
