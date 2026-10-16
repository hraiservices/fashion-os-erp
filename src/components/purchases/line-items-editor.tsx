"use client";

import { useMemo, useState } from "react";
import { Plus, X, Copy } from "lucide-react";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { RawMaterialFormDialog } from "@/components/inventory/raw-material-form-dialog";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/format";
import type { PurchaseItemType, PurchaseLineItem } from "@/lib/purchases";

export interface EditableLine {
  key: string;
  itemType: PurchaseItemType;
  itemId: string;
  itemName: string;
  unitName: string;
  qty: string;
  unitCost: string;
}

export function blankLine(): EditableLine {
  return { key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, itemType: "raw_material", itemId: "", itemName: "", unitName: "", qty: "", unitCost: "" };
}

/** Builds an EditableLine straight from a saved PurchaseLineItem — for edit mode and PO→Bill prefill. */
export function lineFromItem(item: PurchaseLineItem, keyPrefix: string): EditableLine {
  const itemType: PurchaseItemType = item.itemType || (item.productId ? "product" : "raw_material");
  return {
    key: `${keyPrefix}-${Math.random().toString(36).slice(2, 7)}`,
    itemType,
    itemId: itemType === "product" ? item.productId || "" : item.rawMaterialId || "",
    itemName: itemType === "product" ? item.productName || "" : item.rawMaterialName || "",
    unitName: item.unitName || "",
    qty: String(item.qty),
    unitCost: String(item.unitCost),
  };
}

export function linesToItems(lines: EditableLine[]): PurchaseLineItem[] {
  return lines
    .filter((l) => l.itemId && parseFloat(l.qty) > 0)
    .map((l) => {
      const qty = parseFloat(l.qty) || 0;
      const unitCost = parseFloat(l.unitCost) || 0;
      const amount = Math.round(qty * unitCost * 100) / 100;
      return l.itemType === "product"
        ? { itemType: "product" as const, productId: l.itemId, productName: l.itemName, unitName: l.unitName || "pcs", qty, unitCost, amount }
        : { itemType: "raw_material" as const, rawMaterialId: l.itemId, rawMaterialName: l.itemName, unitName: l.unitName, qty, unitCost, amount };
    });
}

const optionValue = (type: PurchaseItemType, id: string) => `${type}:${id}`;

/** Shared repeatable item (raw material or product) + qty + cost editor used by PO, Bill, and Vendor Credit forms. The item box is a
 *  type-and-search field over raw materials and products together, with "Add new …" rows pinned at the top of its list. */
export function LineItemsEditor({ lines, onChange }: { lines: EditableLine[]; onChange: (lines: EditableLine[]) => void }) {
  const { data: rawMaterials } = useRawMaterials();
  const { data: products } = useProducts();
  // Which line a new product / raw material is being created for, and what had been typed in the search box.
  const [createFor, setCreateFor] = useState<{ key: string; type: PurchaseItemType; name: string } | null>(null);

  const options = useMemo<SearchSelectOption[]>(
    () => [
      ...(rawMaterials || []).map((m) => ({
        value: optionValue("raw_material", m.id),
        label: m.name,
        tag: "Raw material",
        sublabel: `${m.stockQty} ${m.unitName} in stock${m.category ? ` · ${m.category}` : ""} · ${inr(m.costPerUnit)}`,
      })),
      ...(products || []).map((p) => ({
        value: optionValue("product", p.id),
        label: p.name,
        tag: "Product",
        sublabel: `${p.stockQty} pcs in stock · ${p.sku}${p.costPrice > 0 ? ` · ${inr(p.costPrice)}` : ""}`,
      })),
    ],
    [rawMaterials, products]
  );

  function selectOption(key: string, value: string) {
    const [type, ...rest] = value.split(":");
    const id = rest.join(":");
    const line = lines.find((l) => l.key === key);
    if (type === "product") {
      const p = (products || []).find((x) => x.id === id);
      if (p) updateLine(key, { itemType: "product", itemId: p.id, itemName: p.name, unitName: "pcs", unitCost: line?.unitCost || String(p.costPrice || "") });
    } else {
      const m = (rawMaterials || []).find((x) => x.id === id);
      if (m) updateLine(key, { itemType: "raw_material", itemId: m.id, itemName: m.name, unitName: m.unitName || "", unitCost: line?.unitCost || String(m.costPerUnit || "") });
    }
  }

  function addLine() {
    onChange([...lines, blankLine()]);
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }

  /** Duplicates a line right after the original — same pattern as the sales-side
   *  ProductLineItemsEditor's cloneLine(). */
  function cloneLine(key: string) {
    const index = lines.findIndex((l) => l.key === key);
    if (index === -1) return;
    const clone: EditableLine = { ...lines[index], key: `clone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    onChange([...lines.slice(0, index + 1), clone, ...lines.slice(index + 1)]);
  }

  const total = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0), 0);

  return (
    <div className="space-y-2">
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">No items added yet.</p>
      ) : (
        lines.map((line) => (
          <div key={line.key} className="flex flex-wrap items-center gap-2">
            <SearchSelect
              className="min-w-[14rem] flex-1"
              inputClassName="h-10 text-sm"
              placeholder="Type to search item…"
              value={line.itemId ? optionValue(line.itemType, line.itemId) : ""}
              fallbackLabel={line.itemName}
              options={options}
              onSelect={(v) => selectOption(line.key, v)}
              createActions={[
                { label: "Add new product", onCreate: (name) => setCreateFor({ key: line.key, type: "product", name }) },
                { label: "Add new raw material", onCreate: (name) => setCreateFor({ key: line.key, type: "raw_material", name }) },
              ]}
            />
            <Input type="number" inputMode="decimal" min={0} step="0.001" placeholder="Qty" className="w-28 h-10" value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value })} />
            <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="Cost/unit" className="w-32 h-10" value={line.unitCost} onChange={(e) => updateLine(line.key, { unitCost: e.target.value })} />
            <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{inr((parseFloat(line.qty) || 0) * (parseFloat(line.unitCost) || 0))}</span>
            <Button type="button" variant="ghost" size="icon-sm" className="size-9 sm:size-7" onClick={() => cloneLine(line.key)} aria-label="Clone item" title="Clone this line" disabled={!line.itemId}>
              <Copy className="size-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" className="size-9 sm:size-7" onClick={() => removeLine(line.key)} aria-label="Remove item">
              <X className="size-3.5" />
            </Button>
          </div>
        ))
      )}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus className="size-3.5" /> Add item
        </Button>
        <span className="text-sm font-medium">Total: {inr(total)}</span>
      </div>

      <ProductFormDialog
        open={createFor?.type === "product"}
        onOpenChange={(v) => { if (!v) setCreateFor(null); }}
        defaultName={createFor?.name}
        onSaved={(p) => {
          if (createFor) updateLine(createFor.key, { itemType: "product", itemId: p.id, itemName: p.name, unitName: "pcs", unitCost: String(p.costPrice || "") });
          setCreateFor(null);
        }}
      />
      <RawMaterialFormDialog
        open={createFor?.type === "raw_material"}
        onOpenChange={(v) => { if (!v) setCreateFor(null); }}
        defaultName={createFor?.name}
        onSaved={(m) => {
          if (createFor) updateLine(createFor.key, { itemType: "raw_material", itemId: m.id, itemName: m.name, unitName: m.unitName || "", unitCost: String(m.costPerUnit || "") });
          setCreateFor(null);
        }}
      />
    </div>
  );
}
