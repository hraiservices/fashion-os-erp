"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ItemPicker, ItemPickerTrigger } from "@/components/purchases/item-picker";
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

/** Shared repeatable item (raw material or product) + qty + cost editor used by PO, Bill, and Vendor Credit forms. */
export function LineItemsEditor({ lines, onChange }: { lines: EditableLine[]; onChange: (lines: EditableLine[]) => void }) {
  const [pickerForKey, setPickerForKey] = useState<string | null>(null);

  function addLine() {
    onChange([...lines, blankLine()]);
  }

  function updateLine(key: string, patch: Partial<EditableLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }

  const total = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.unitCost) || 0), 0);

  return (
    <div className="space-y-2">
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">No items added yet.</p>
      ) : (
        lines.map((line) => (
          <div key={line.key} className="flex items-center gap-2">
            <ItemPickerTrigger
              label={line.itemName}
              typeBadge={line.itemName ? (line.itemType === "product" ? "Product" : "Raw Material") : undefined}
              onClick={() => setPickerForKey(line.key)}
            />
            <Input type="number" min={0} step="0.001" placeholder="Qty" className="w-24" value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value })} />
            <Input type="number" min={0} step="0.01" placeholder="Cost/unit" className="w-28" value={line.unitCost} onChange={(e) => updateLine(line.key, { unitCost: e.target.value })} />
            <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{inr((parseFloat(line.qty) || 0) * (parseFloat(line.unitCost) || 0))}</span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLine(line.key)} aria-label="Remove item">
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

      <ItemPicker
        open={!!pickerForKey}
        onOpenChange={(v) => !v && setPickerForKey(null)}
        onSelect={(item) => {
          if (pickerForKey) {
            const line = lines.find((l) => l.key === pickerForKey);
            updateLine(pickerForKey, {
              itemType: item.itemType,
              itemId: item.id,
              itemName: item.name,
              unitName: item.unitName,
              unitCost: line?.unitCost || String(item.unitCost || ""),
            });
          }
          setPickerForKey(null);
        }}
      />
    </div>
  );
}
