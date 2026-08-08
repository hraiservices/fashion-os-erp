"use client";

import { useMemo, useState } from "react";
import { Search, Package, Plus } from "lucide-react";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { RawMaterialFormDialog } from "@/components/inventory/raw-material-form-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";

/** Searchable raw-material picker for the Purchase Bill/PO line-item editor — also lets you create a brand-new raw material inline without leaving the form, so a new inventory item appears in the list immediately. */
export function RawMaterialPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (material: { id: string; name: string }) => void;
}) {
  const { data: rawMaterials } = useRawMaterials();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const list = rawMaterials || [];
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
  }, [rawMaterials, query]);

  function handleSelect(m: { id: string; name: string }) {
    onOpenChange(false);
    setQuery("");
    onSelect(m);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) setQuery(""); onOpenChange(v); }}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Package className="size-4 text-muted-foreground" /> Select raw material
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 border-b px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus placeholder="Search name or category…" className="h-9 pl-8 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" /> Add new raw material
            </Button>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Package className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No raw materials found</p>
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50" onClick={() => handleSelect(m)}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.stockQty} {m.unitName} in stock{m.category ? ` · ${m.category}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{inr(m.costPerUnit)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <RawMaterialFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={(m) => handleSelect(m)} />
    </>
  );
}

export function RawMaterialPickerTrigger({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className="flex-1 justify-start font-normal">
      {label || <span className="text-muted-foreground">Select material…</span>}
    </Button>
  );
}
