"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, X, ScanBarcode, Camera, Copy, ListChecks, MoreVertical } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarcodeScannerModal } from "@/components/pos/barcode-scanner-modal";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { totalPieces, type SalesLineItem } from "@/lib/sales";
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
  /** Optional free-text note printed under the item name on the document. */
  description?: string;
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
        ...(l.description?.trim() ? { description: l.description.trim() } : {}),
        ...(costPrice !== undefined ? { costPrice } : {}),
        amount: lineAmount(qty, unitPrice, discountType, discountPercent, discountFlat),
      };
    });
}

/** Appends `qty` of `product` to `current` — bumps the existing line for it, else fills the first blank row, else adds a row. */
function withProduct(current: EditableSalesLine[], product: Product, qty: number, priceOverrides?: Map<string, number>): EditableSalesLine[] {
  const existing = current.find((l) => l.productId === product.id);
  if (existing) return current.map((l) => (l.key === existing.key ? { ...l, qty: String((parseFloat(l.qty) || 0) + qty) } : l));
  const price = priceOverrides?.get(product.id) ?? product.sellingPrice;
  const blank = current.find((l) => !l.productId);
  const patched = { ...(blank || blankSalesLine()), productId: product.id, qty: String(qty), unitPrice: String(price), costPrice: String(product.costPrice || 0) };
  return blank ? current.map((l) => (l.key === blank.key ? patched : l)) : [...current, patched];
}

/** "Add Items in Bulk": tick several products, set each quantity, add them all in one go. */
function BulkAddDialog({ open, onOpenChange, products, onAdd }: { open: boolean; onOpenChange: (v: boolean) => void; products: Product[]; onAdd: (entries: { product: Product; qty: number }[]) => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => p.active && (!needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle))).slice(0, 100);
  }, [products, q]);

  function close(v: boolean) {
    if (!v) {
      setQ("");
      setPicked(new Map());
    }
    onOpenChange(v);
  }

  function toggle(id: string) {
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(id)) next.delete(id);
      else next.set(id, "1");
      return next;
    });
  }

  function submit() {
    const entries = products.flatMap((p) => {
      const qty = parseFloat(picked.get(p.id) || "");
      return picked.has(p.id) && qty > 0 ? [{ product: p, qty }] : [];
    });
    if (entries.length > 0) onAdd(entries);
    close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add items in bulk</DialogTitle>
        </DialogHeader>
        <Input type="search" placeholder="Search by name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} className="h-10" />
        <div className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
          {list.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No products found.</p>
          ) : (
            list.map((p) => (
              <div key={p.id} className="flex items-center gap-1 pr-2">
                <Checkbox checked={picked.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />
                <button type="button" onClick={() => toggle(p.id)} className="min-w-0 flex-1 py-2 text-left">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.sku} · {p.stockQty} in stock · {inr(p.sellingPrice)}
                  </span>
                </button>
                {picked.has(p.id) && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step="1"
                    aria-label={`Quantity of ${p.name}`}
                    className="h-9 w-20 text-sm"
                    value={picked.get(p.id) || ""}
                    onChange={(e) => setPicked((m) => new Map(m).set(p.id, e.target.value))}
                  />
                )}
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={picked.size === 0}>
            Add {picked.size > 0 ? `${picked.size} item${picked.size === 1 ? "" : "s"}` : "items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Zoho-style item table for quotations and invoices: Item details (with an optional description), Quantity (with stock on hand), Rate, Discount and Amount.
 *  Below `2xl` each line becomes a stacked card so it stays usable on phones and narrow columns. Discount/margin columns are opt-in — only invoices show them. */
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
  const [scanOpen, setScanOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  // Which line's "add new product" dialog is open, and what the user had already typed into
  // that line's search box — prefilled as the new product's name.
  const [addProductLineKey, setAddProductLineKey] = useState<string | null>(null);
  const [addProductQuery, setAddProductQuery] = useState("");
  // Bulk actions: tick rows, then delete them or give them all one discount.
  const [bulkMode, setBulkMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkDiscount, setBulkDiscount] = useState("");
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  // Lines whose description box was opened by hand (a line that already has text always shows it).
  const [descOpen, setDescOpen] = useState<Set<string>>(new Set());

  // Column template at 2xl+: fixed-width number columns, item column takes the rest.
  const gridCols = showDiscount
    ? "2xl:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_8rem_6.5rem_4rem]"
    : "2xl:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_6.5rem_4rem]";

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

  /** Adds/bumps a specific product — shared by barcode/SKU scan and name search. */
  function addProduct(product: Product) {
    onChange(withProduct(lines, product, 1, priceOverrides));
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

  function togglePicked(key: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function endBulk() {
    setBulkMode(false);
    setPicked(new Set());
    setBulkDiscount("");
  }

  function deletePicked() {
    onChange(lines.filter((l) => !picked.has(l.key)));
    setPicked(new Set());
  }

  function applyBulkDiscount() {
    const pct = Math.min(100, Math.max(0, parseFloat(bulkDiscount) || 0));
    onChange(lines.map((l) => (picked.has(l.key) ? { ...l, discountType: "percent" as const, discountPercent: String(pct) } : l)));
    toast.success(`${pct}% discount applied to ${picked.size} item${picked.size === 1 ? "" : "s"}`);
  }

  // Archived products are hidden from new selections — the whole point of archiving is to stop
  // it coming up for new sales — but a line already pointing at one (an existing invoice/quote
  // being edited) must still resolve to its name rather than showing a blank/unknown option.
  const productOptions = useMemo(() => {
    const usedIds = new Set(lines.map((l) => l.productId).filter(Boolean));
    return (products || [])
      .filter((p) => p.active || usedIds.has(p.id))
      .map((p) => ({ value: p.id, label: p.name, sublabel: `${p.sku} · ${p.stockQty} in stock · ${inr(p.sellingPrice)}` }));
  }, [products, lines]);

  const productById = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);

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

  const cell = "2xl:h-full 2xl:border-l 2xl:p-2";
  const headCell = "p-2 2xl:border-l first:border-l-0";
  const mobileLabel = "mb-1 block text-[10px] font-medium text-muted-foreground 2xl:hidden";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Item Table</h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className={cn("text-primary", scanOpen && "bg-muted")} onClick={() => setScanOpen((v) => !v)}>
            <ScanBarcode className="size-3.5" /> Scan Item
          </Button>
          <Button type="button" variant="ghost" size="sm" className={cn("text-primary", bulkMode && "bg-muted")} onClick={() => (bulkMode ? endBulk() : setBulkMode(true))}>
            <ListChecks className="size-3.5" /> Bulk Actions
          </Button>
        </div>
      </div>

      {scanOpen && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={scanRef}
              autoFocus
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
          <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => setScannerOpen(true)} aria-label="Scan with camera">
            <Camera className="size-4" />
          </Button>
        </div>
      )}

      {bulkMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{picked.size} selected</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicked(picked.size === lines.length ? new Set() : new Set(lines.map((l) => l.key)))} disabled={lines.length === 0}>
            {picked.size === lines.length && lines.length > 0 ? "Clear" : "Select all"}
          </Button>
          {showDiscount && (
            <div className="flex items-center gap-1">
              <Input type="number" inputMode="decimal" min={0} max={100} step="0.01" placeholder="Disc. %" aria-label="Discount percent for selected items" className="h-8 w-24 text-sm" value={bulkDiscount} onChange={(e) => setBulkDiscount(e.target.value)} />
              <Button type="button" variant="outline" size="sm" onClick={applyBulkDiscount} disabled={picked.size === 0 || !bulkDiscount}>
                Apply
              </Button>
            </div>
          )}
          <Button type="button" variant="destructive" size="sm" onClick={deletePicked} disabled={picked.size === 0}>
            Delete
          </Button>
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={endBulk}>
            Done
          </Button>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">No items added yet.</p>
      ) : (
        <div className="space-y-2 2xl:space-y-0 2xl:rounded-lg 2xl:border">
          {/* Column headers — wide screens only; narrow screens label each field inside its card. */}
          <div className={cn("hidden rounded-t-lg border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground 2xl:grid", gridCols)}>
            <div className={headCell}>Item details</div>
            <div className={cn(headCell, "text-right")}>Quantity</div>
            <div className={cn(headCell, "text-right")}>Rate</div>
            {showDiscount && <div className={cn(headCell, "text-right")}>Discount</div>}
            <div className={cn(headCell, "text-right")}>Amount</div>
            <div className={headCell} />
          </div>
          {lines.map((line) => {
            const { amount, margin } = lineTotals(line);
            const discountType = line.discountType || "percent";
            // Advisory only, not a block — a shop legitimately backdating a historical sale, or
            // selling a made-to-order/service line with no real stock tracking, must still be able
            // to save. This just surfaces what would otherwise be a silent oversell.
            const selectedProduct = line.productId ? productById.get(line.productId) : undefined;
            const qtyNum = parseFloat(line.qty) || 0;
            const oversell = !!selectedProduct && qtyNum > selectedProduct.stockQty;
            return (
              <div key={line.key} className={cn("space-y-3 rounded-lg border bg-card p-3 2xl:grid 2xl:space-y-0 2xl:rounded-none 2xl:border-0 2xl:border-b 2xl:bg-transparent 2xl:p-0 2xl:last:border-b-0", gridCols)}>
                {/* Card header (below 2xl): line number, with clone/remove tucked into a menu so the item box can use the full width */}
                <div className="flex items-center justify-between 2xl:hidden">
                  <div className="flex items-center gap-1">
                    {bulkMode && <Checkbox checked={picked.has(line.key)} onChange={() => togglePicked(line.key)} aria-label="Select line" className="-my-1.5" />}
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item {lines.indexOf(line) + 1}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Item actions">
                          <MoreVertical className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => cloneLine(line.key)} disabled={!line.productId}>
                        <Copy className="size-4" /> Clone item
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => removeLine(line.key)}>
                        <X className="size-4" /> Remove item
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Item + description */}
                <div className="flex items-start gap-1 2xl:p-2">
                  {bulkMode && <Checkbox checked={picked.has(line.key)} onChange={() => togglePicked(line.key)} aria-label="Select line" className="-my-1.5 hidden 2xl:inline-flex" />}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <SearchSelect
                      className="w-full"
                      inputClassName="h-10 text-sm"
                      placeholder="Type to search item…"
                      value={line.productId}
                      options={productOptions}
                      onSelect={(v) => {
                        const product = (products || []).find((p) => p.id === v);
                        const price = priceOverrides?.get(v) ?? product?.sellingPrice ?? "";
                        updateLine(line.key, { productId: v, unitPrice: line.unitPrice || String(price), costPrice: String(product?.costPrice || 0) });
                      }}
                      onCreateNew={(query) => {
                        setAddProductQuery(query);
                        setAddProductLineKey(line.key);
                      }}
                      createLabel="Add new product"
                    />
                    {line.description || descOpen.has(line.key) ? (
                      <Textarea
                        rows={1}
                        placeholder="Add a description to your item"
                        aria-label="Item description"
                        className="min-h-9 resize-none bg-muted/30 py-1.5 text-sm"
                        value={line.description || ""}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                      />
                    ) : (
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setDescOpen((s) => new Set(s).add(line.key))}>
                        + Add description
                      </button>
                    )}
                  </div>
                </div>

                {/* Qty / Rate / Discount — labeled grid in a card, table cells at 2xl+ */}
                <div className="grid grid-cols-2 gap-2 2xl:contents">
                  <div className={cell}>
                    <label className={mobileLabel}>Qty</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step="1"
                      placeholder="Qty"
                      className={cn("h-10 w-full text-sm 2xl:text-right", oversell && "border-amber-500 focus-visible:ring-amber-500/50")}
                      value={line.qty}
                      onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                    />
                    {selectedProduct && (
                      <p className={cn("mt-1 text-[11px] leading-tight 2xl:text-right", oversell ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground")}>
                        {oversell ? `Only ${selectedProduct.stockQty} in stock` : `Stock on hand: ${selectedProduct.stockQty} pcs`}
                      </p>
                    )}
                  </div>
                  <div className={cell}>
                    <label className={mobileLabel}>Rate</label>
                    <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="Rate" className="h-10 w-full text-sm 2xl:text-right" value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })} />
                  </div>
                  {showDiscount && (
                    <div className={cn(cell, "col-span-2")}>
                      <label className={mobileLabel}>Discount</label>
                      <div className="flex h-10 items-stretch overflow-hidden rounded-md border">
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
                          inputMode="decimal"
                          min={0}
                          max={discountType === "percent" ? 100 : undefined}
                          step="0.01"
                          placeholder="0"
                          className="h-10 w-full min-w-0 rounded-none border-0 text-sm 2xl:text-right"
                          value={discountType === "percent" ? line.discountPercent : line.discountFlat || ""}
                          onChange={(e) => updateLine(line.key, discountType === "percent" ? { discountPercent: e.target.value } : { discountFlat: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div className={cn("flex items-center justify-between border-t pt-2 2xl:block 2xl:border-t-0 2xl:text-right", cell, "2xl:pt-2")}>
                  <span className="text-[10px] font-medium text-muted-foreground 2xl:hidden">Amount</span>
                  <div className="text-right">
                    <p className="text-base font-semibold tabular-nums 2xl:text-sm">{inr(amount)}</p>
                    {showMargin && line.productId && (
                      <p className={cn("text-[11px] tabular-nums", margin === null ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400")}>
                        {margin === null ? "cost unknown" : `+${inr(margin)}`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Clone / remove — table view only (cards carry them beside the item) */}
                <div className={cn("hidden items-start justify-center gap-0.5 2xl:flex", cell)}>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => cloneLine(line.key)} aria-label="Clone item" title="Clone this line" disabled={!line.productId}>
                    <Copy className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLine(line.key)} aria-label="Remove item">
                    <X className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="size-3.5" /> Add New Row
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setBulkAddOpen(true)}>
            <Plus className="size-3.5" /> Add Items in Bulk
          </Button>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">
            Total pieces: <span className="font-medium tabular-nums text-foreground">{totalPieces(lines)}</span>
          </p>
          <span className="text-sm font-medium">Total: {inr(total)}</span>
          {showMargin && (
            <p className={cn("text-xs font-medium", marginTotal === null ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400")}>
              Est. margin: {marginTotal === null ? "cost unknown for some lines" : inr(marginTotal)}
            </p>
          )}
        </div>
      </div>

      <BarcodeScannerModal open={scannerOpen} onOpenChange={setScannerOpen} onDetected={scanAdd} />

      <BulkAddDialog
        open={bulkAddOpen}
        onOpenChange={setBulkAddOpen}
        products={products || []}
        onAdd={(entries) => onChange(entries.reduce((acc, e) => withProduct(acc, e.product, e.qty, priceOverrides), lines))}
      />

      <ProductFormDialog
        open={!!addProductLineKey}
        onOpenChange={(v) => { if (!v) setAddProductLineKey(null); }}
        defaultName={addProductQuery}
        onSaved={(p) => {
          if (addProductLineKey) {
            const price = priceOverrides?.get(p.id) ?? p.sellingPrice ?? "";
            updateLine(addProductLineKey, { productId: p.id, unitPrice: String(price), costPrice: String(p.costPrice || 0) });
          }
          setAddProductLineKey(null);
        }}
      />
    </div>
  );
}
