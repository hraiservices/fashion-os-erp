"use client";

import { useMemo, useState } from "react";
import { Search, Package, ShoppingBag, Plus } from "lucide-react";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { RawMaterialFormDialog } from "@/components/inventory/raw-material-form-dialog";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PurchaseItemType } from "@/lib/purchases";

export interface PickedItem {
  itemType: PurchaseItemType;
  id: string;
  name: string;
  unitName: string;
  unitCost: number;
}

/**
 * Searchable picker for a Purchase Order/Bill/Vendor Credit line — buying raw materials
 * (the common case, to manufacture from) or finished products directly (buying ready-made
 * goods to resell). Either tab lets you create a brand-new item inline without leaving the
 * form; it's the same Inventory form used elsewhere, so nothing gets out of sync.
 */
export function ItemPicker({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (item: PickedItem) => void }) {
  const { data: rawMaterials } = useRawMaterials();
  const { data: products } = useProducts();
  const [tab, setTab] = useState<PurchaseItemType>("raw_material");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const filteredMaterials = useMemo(() => {
    const list = rawMaterials || [];
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
  }, [rawMaterials, query]);

  const filteredProducts = useMemo(() => {
    const list = products || [];
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, query]);

  function close() {
    onOpenChange(false);
    setQuery("");
  }

  function handleSelectMaterial(m: { id: string; name: string; unitName?: string; costPerUnit?: number }) {
    close();
    onSelect({ itemType: "raw_material", id: m.id, name: m.name, unitName: m.unitName || "", unitCost: m.costPerUnit ?? 0 });
  }

  function handleSelectProduct(p: { id: string; name: string; costPrice?: number }) {
    close();
    onSelect({ itemType: "product", id: p.id, name: p.name, unitName: "pcs", unitCost: p.costPrice ?? 0 });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(v); }}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              {tab === "product" ? <ShoppingBag className="size-4 text-muted-foreground" /> : <Package className="size-4 text-muted-foreground" />}
              Select item
            </DialogTitle>
          </DialogHeader>

          <div className="mt-3 flex gap-1 border-b px-4 pb-3">
            <button
              type="button"
              onClick={() => setTab("raw_material")}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "raw_material" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              Raw Materials
            </button>
            <button
              type="button"
              onClick={() => setTab("product")}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "product" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              Products (resale)
            </button>
          </div>

          <div className="space-y-2 border-b px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={tab === "product" ? "Search name or SKU…" : "Search name or category…"}
                className="h-9 pl-8 text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" /> Add new {tab === "product" ? "product" : "raw material"}
            </Button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {tab === "raw_material" ? (
              filteredMaterials.length === 0 ? (
                <EmptyRow icon={Package} label="No raw materials found" />
              ) : (
                <ul className="divide-y">
                  {filteredMaterials.map((m) => (
                    <li key={m.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50" onClick={() => handleSelectMaterial(m)}>
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
              )
            ) : filteredProducts.length === 0 ? (
              <EmptyRow icon={ShoppingBag} label="No products found" />
            ) : (
              <ul className="divide-y">
                {filteredProducts.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50" onClick={() => handleSelectProduct(p)}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.stockQty} pcs in stock · {p.sku}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.costPrice > 0 ? inr(p.costPrice) : "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {tab === "raw_material" ? (
        <RawMaterialFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={handleSelectMaterial} />
      ) : (
        <ProductFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={handleSelectProduct} />
      )}
    </>
  );
}

function EmptyRow({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon className="size-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function ItemPickerTrigger({ label, typeBadge, onClick }: { label: string; typeBadge?: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className="flex-1 justify-start gap-2 font-normal">
      {label ? (
        <>
          <span className="truncate">{label}</span>
          {typeBadge && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{typeBadge}</span>}
        </>
      ) : (
        <span className="text-muted-foreground">Select item…</span>
      )}
    </Button>
  );
}
