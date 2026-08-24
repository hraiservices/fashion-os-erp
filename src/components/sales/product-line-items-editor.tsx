"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, X, ScanBarcode, Camera, Copy } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import { BarcodeScannerModal } from "@/components/pos/barcode-scanner-modal";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SalesLineItem } from "@/lib/sales";
import type { Product } from "@/lib/types";

export interface EditableSalesLine {
  key: string;
  productId: string;
  qty: string;
  unitPrice: string;
  /** "percent" (default) or "flat" — which of the two fields below applies. */
  discountType?: "flat" | "percent";
  /** Per-line discount, percent (0-100), as a string for controlled-input editing. */
  discountPercent: string;
  /** Per-line discount, ₹, as a string for controlled-input editing. */
  discountFlat?: string;
  /** Snapshotted from Product.costPrice when the line's product is selected — not user-edited. */
  costPrice?: string;
}

export function blankSalesLine(): EditableSalesLine {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: "",
    qty: "1",
    unitPrice: "",
    discountType: "percent",
    discountPercent: "",
    discountFlat: "",
    costPrice: "",
  };
}

function lineAmount(qty: number, unitPrice: number, discountType: "flat" | "percent" | undefined, discountPercent: number, discountFlat: number): number {
  const gross = qty * unitPrice;
  if (discountType === "flat") {
    // Clamp discountFlat itself, not just the result — a negative value here would otherwise
    // inflate the line total above list price (e.g. typing "-50") until the server rejects it.
    return Math.round(Math.max(0, gross - Math.max(0, discountFlat)) * 100) / 100;
  }
  const discounted = gross * (1 - Math.min(100, Math.max(0, discountPercent)) / 100);
  return Math.round(discounted * 100) / 100;
}

export function salesLinesToItems(lines: EditableSalesLine[], productsById: Map<string, { name: string }>): SalesLineItem[] {
  return lines
    .filter((l) => l.productId && parseFloat(l.qty) > 0)
    .map((l) => {
      const qty = parseFloat(l.qty) || 0;
      const unitPrice = parseFloat(l.unitPrice) || 0;
      const discountType = l.discountType || "percent";
      const discountPercent = parseFloat(l.discountPercent) || 0;
      const discountFlat = parseFloat(l.discountFlat || "0") || 0;
      const product = productsById.get(l.productId);
      // Omit the key (not 0) when unknown — an empty/missing costPrice means "we don't know",
      // which computeInvoiceMargin needs to tell apart from a genuinely free product.
      const costPrice = l.costPrice !== undefined && l.costPrice !== "" ? parseFloat(l.costPrice) || 0 : undefined;
      return {
        productId: l.productId,
        productName: product?.name || "Unknown",
        qty,
        unitPrice,
        discountType,
        discountPercent,
        discountFlat,
        ...(costPrice !== undefined ? { costPrice } : {}),
        amount: lineAmount(qty, unitPrice, discountType, discountPercent, discountFlat),
      };
    });
}

/** Repeatable product + qty + price editor for quotations and invoices. Discount/margin
 *  columns are opt-in — only invoices show them. */
export function ProductLineItemsEditor({
  lines,
  onChange,
  showDiscount = false,
  showMargin = false,
  priceOverrides,
}: {
  lines: EditableSalesLine[];
  onChange: (lines: EditableSalesLine[]) => void;
  showDiscount?: boolean;
  /** Shows a running "Est. margin" figure alongside the line total — needs Product.costPrice,
   *  so only makes sense where showDiscount/cost-visibility already applies (invoices). */
  showMargin?: boolean;
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

  /** Duplicates a line (new qty defaults to 1, matching a fresh add) right after the original. */
  function cloneLine(key: string) {
    const index = lines.findIndex((l) => l.key === key);
    if (index === -1) return;
    const clone: EditableSalesLine = { ...lines[index], key: `clone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    onChange([...lines.slice(0, index + 1), clone, ...lines.slice(index + 1)]);
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
      const patched = { ...line, productId: product.id, qty: line.qty || "1", unitPrice: String(price), costPrice: String(product.costPrice || 0) };
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

  const productOptions = useMemo(
    () => (products || []).map((p) => ({ value: p.id, label: p.name, sublabel: `${p.sku} · ${p.stockQty} in stock · ${inr(p.sellingPrice)}` })),
    [products]
  );

  function lineTotals(l: EditableSalesLine) {
    const qty = parseFloat(l.qty) || 0;
    const unitPrice = parseFloat(l.unitPrice) || 0;
    const discountType = l.discountType || "percent";
    const amount = lineAmount(qty, unitPrice, discountType, parseFloat(l.discountPercent) || 0, parseFloat(l.discountFlat || "0") || 0);
    // null (not 0) when cost is unknown — a legacy/unselected line — so it never reads as a
    // misleading 100%-margin instead of "we don't know".
    const costKnown = l.costPrice !== undefined && l.costPrice !== "";
    const margin = costKnown ? amount - qty * (parseFloat(l.costPrice!) || 0) : null;
    return { amount, margin };
  }

  const total = lines.reduce((s, l) => s + lineTotals(l).amount, 0);
  const marginTotals = lines.map((l) => lineTotals(l).margin);
  const marginTotal = marginTotals.some((m) => m === null) ? null : (marginTotals as number[]).reduce((s, m) => s + m, 0);

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
        lines.map((line) => {
          const { amount, margin } = lineTotals(line);
          const discountType = line.discountType || "percent";
          return (
            <div key={line.key} className="flex items-center gap-2">
              <SearchSelect
                className="flex-1"
                inputClassName="h-10"
                placeholder="Type to search item…"
                value={line.productId}
                options={productOptions}
                onSelect={(v) => {
                  const product = (products || []).find((p) => p.id === v);
                  const price = priceOverrides?.get(v) ?? product?.sellingPrice ?? "";
                  updateLine(line.key, { productId: v, unitPrice: line.unitPrice || String(price), costPrice: String(product?.costPrice || 0) });
                }}
              />
              <Input type="number" min={0} step="1" placeholder="Qty" className="w-20 h-10" value={line.qty} onChange={(e) => updateLine(line.key, { qty: e.target.value })} />
              <Input type="number" min={0} step="0.01" placeholder="Price" className="w-28 h-10" value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })} />
              {showDiscount && (
                <div className="flex h-10 shrink-0 items-stretch overflow-hidden rounded-md border">
                  <button
                    type="button"
                    onClick={() => updateLine(line.key, { discountType: discountType === "percent" ? "flat" : "percent" })}
                    className="flex w-8 shrink-0 items-center justify-center border-r bg-muted text-xs font-medium text-muted-foreground hover:text-foreground"
                    title={discountType === "percent" ? "Switch to flat ₹ discount" : "Switch to % discount"}
                    aria-label="Toggle discount type"
                  >
                    {discountType === "percent" ? "%" : "₹"}
                  </button>
                  <Input
                    type="number"
                    min={0}
                    max={discountType === "percent" ? 100 : undefined}
                    step="0.01"
                    placeholder="Disc."
                    className="w-16 h-10 rounded-none border-0"
                    value={discountType === "percent" ? line.discountPercent : line.discountFlat || ""}
                    onChange={(e) =>
                      updateLine(line.key, discountType === "percent" ? { discountPercent: e.target.value } : { discountFlat: e.target.value })
                    }
                  />
                </div>
              )}
              <div className="w-24 shrink-0 text-right">
                <p className="text-sm tabular-nums text-muted-foreground">{inr(amount)}</p>
                {showMargin && line.productId && (
                  <p className={cn("text-[11px] tabular-nums", margin === null ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400")}>
                    {margin === null ? "cost unknown" : `+${inr(margin)}`}
                  </p>
                )}
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => cloneLine(line.key)} aria-label="Clone item" title="Clone this line" disabled={!line.productId}>
                <Copy className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLine(line.key)} aria-label="Remove item">
                <X className="size-3.5" />
              </Button>
            </div>
          );
        })
      )}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus className="size-3.5" /> Add item
        </Button>
        <div className="text-right">
          <span className="text-sm font-medium">Total: {inr(total)}</span>
          {showMargin && (
            <p className={cn("text-xs font-medium", marginTotal === null ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400")}>
              Est. margin: {marginTotal === null ? "cost unknown for some lines" : inr(marginTotal)}
            </p>
          )}
        </div>
      </div>

      <BarcodeScannerModal open={scannerOpen} onOpenChange={setScannerOpen} onDetected={scanAdd} />
    </div>
  );
}
