"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, X, ScanBarcode, Camera } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarcodeScannerModal } from "@/components/pos/barcode-scanner-modal";
import { inr } from "@/lib/format";
import type { SalesLineItem } from "@/lib/sales";
import type { Product } from "@/lib/types";

export interface EditableSalesLine {
  key: string;
  productId: string;
  qty: string;
  unitPrice: string;
  /** Per-line discount, percent (0-100), as a string for controlled-input editing. */
  discountPercent: string;
}

export function blankSalesLine(): EditableSalesLine {
  return { key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, productId: "", qty: "1", unitPrice: "", discountPercent: "" };
}

function lineAmount(qty: number, unitPrice: number, discountPercent: number): number {
  const gross = qty * unitPrice;
  const discounted = gross * (1 - Math.min(100, Math.max(0, discountPercent)) / 100);
  return Math.round(discounted * 100) / 100;
}

export function salesLinesToItems(lines: EditableSalesLine[], productsById: Map<string, { name: string }>): SalesLineItem[] {
  return lines
    .filter((l) => l.productId && parseFloat(l.qty) > 0)
    .map((l) => {
      const qty = parseFloat(l.qty) || 0;
      const unitPrice = parseFloat(l.unitPrice) || 0;
      const discountPercent = parseFloat(l.discountPercent) || 0;
      const product = productsById.get(l.productId);
      return {
        productId: l.productId,
        productName: product?.name || "Unknown",
        qty,
        unitPrice,
        discountPercent,
        amount: lineAmount(qty, unitPrice, discountPercent),
      };
    });
}

/** Repeatable product + qty + price editor for quotations and invoices. Discount column is opt-in — only invoices show it. */
export function ProductLineItemsEditor({
  lines,
  onChange,
  showDiscount = false,
  priceOverrides,
}: {
  lines: EditableSalesLine[];
  onChange: (lines: EditableSalesLine[]) => void;
  showDiscount?: boolean;
  /** productId -> price, from the selected customer's assigned price list — takes priority over the product's default sellingPrice. */
  priceOverrides?: Map<string, number>;
}) {
  const { data: products } = useProducts();
  const [scanValue, setScanValue] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  function addLine() {
    onChange([...lines, blankSalesLine()]);
  }

  function updateLine(key: string, patch: Partial<EditableSalesLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }

  /** Adds/bumps a specific product — shared by barcode/SKU scan, name search, and manual dropdown pick. */
  function addProduct(product: Product) {
    const existing = lines.find((l) => l.productId === product.id);
    if (existing) {
      updateLine(existing.key, { qty: String((parseFloat(existing.qty) || 0) + 1) });
    } else {
      const price = priceOverrides?.get(product.id) ?? product.sellingPrice;
      const blank = lines.find((l) => !l.productId);
      const line = blank || blankSalesLine();
      const patched = { ...line, productId: product.id, qty: line.qty || "1", unitPrice: String(price) };
      onChange(blank ? lines.map((l) => (l.key === blank.key ? patched : l)) : [...lines, patched]);
    }
    setScanValue("");
    setSuggestOpen(false);
    scanRef.current?.focus();
  }

  /** Barcode/SKU scan (exact match) — what a hardware scanner or Enter-after-typing-a-code triggers. */
  function scanAdd(code: string) {
    const product = (products || []).find((p: Product) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase());
    if (!product) {
      toast.error(`No product matches "${code}"`);
      return;
    }
    addProduct(product);
  }

  const nameMatches = useMemo(() => {
    const q = scanValue.trim().toLowerCase();
    if (!q) return [];
    return (products || []).filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode?.toLowerCase() === q).slice(0, 8);
  }, [products, scanValue]);

  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSuggestOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = scanValue.trim();
    if (!code) return;
    // Enter with suggestions showing picks the top name match; otherwise falls back to an exact barcode/SKU lookup (hardware scanners submit via Enter too).
    if (nameMatches.length > 0) addProduct(nameMatches[0]);
    else scanAdd(code);
  }

  const productLabel = (id: string) => (products || []).find((p) => p.id === id)?.name ?? "";
  const total = lines.reduce((s, l) => s + lineAmount(parseFloat(l.qty) || 0, parseFloat(l.unitPrice) || 0, parseFloat(l.discountPercent) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={scanRef}
            placeholder="Scan barcode, or search by item name/SKU…"
            className="pl-9"
            value={scanValue}
            onChange={(e) => {
              setScanValue(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={handleScanKeyDown}
          />
          {suggestOpen && nameMatches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg">
              {nameMatches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    // onMouseDown (not onClick) fires before the input's onBlur closes the list.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addProduct(p);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.sku} · {inr(p.sellingPrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="button" variant="outline" size="icon" onClick={() => setScannerOpen(true)} aria-label="Scan with camera">
          <Camera className="size-4" />
        </Button>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">No items added yet.</p>
      ) : (
        lines.map((line) => (
          <div key={line.key} className="flex items-center gap-2">
            <Select
              value={line.productId}
              onValueChange={(v) => {
                if (!v) return;
                const product = (products || []).find((p) => p.id === v);
                const price = priceOverrides?.get(v) ?? product?.sellingPrice ?? "";
                updateLine(line.key, { productId: v, unitPrice: line.unitPrice || String(price) });
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select product…">{productLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(products || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.stockQty} in stock)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" min={0} step="1" placeholder="Qty" className="w-20" value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value })} />
            <Input type="number" min={0} step="0.01" placeholder="Price" className="w-28" value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })} />
            {showDiscount && (
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="Disc %"
                className="w-20"
                value={line.discountPercent}
                onChange={(e) => updateLine(line.key, { discountPercent: e.target.value })}
              />
            )}
            <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
              {inr(lineAmount(parseFloat(line.qty) || 0, parseFloat(line.unitPrice) || 0, parseFloat(line.discountPercent) || 0))}
            </span>
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

      <BarcodeScannerModal open={scannerOpen} onOpenChange={setScannerOpen} onDetected={scanAdd} />
    </div>
  );
}
