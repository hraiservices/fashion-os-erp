"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ScanBarcode,
  Camera,
  Trash2,
  Plus,
  Minus,
  User,
  X,
  Lock,
  Unlock,
  Printer,
  PauseCircle,
  PlayCircle,
  Undo2,
  Percent,
  Star,
  Tag,
  Gift,
  WifiOff,
  MessageCircle,
  ListPlus,
} from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { useSaveInvoice, useRaiseSalesCreditNote, type SaveInvoiceInput } from "@/hooks/use-sales-mutations";
import { useOpenPosSession, useOpenRegister, useCloseRegister, useSessionCashTotal, useSessionSalesSummary, useLastClosedSession } from "@/hooks/use-pos-session";
import { genInvoiceNumber, genSalesCreditNumber, computeLineItemsTotal, type SalesLineItem } from "@/lib/sales";
import { computeInvoiceTotals, type DiscountType } from "@/lib/invoice-totals";
import { computeRedemption } from "@/lib/business-rules";
import { printThermalReceipt } from "@/lib/thermal-receipt";
import { printBarcodeLabel } from "@/lib/barcode";
import { hapticSuccess, hapticError } from "@/lib/haptics";
import { isLowStock } from "@/lib/inventory";
import { inr } from "@/lib/format";
import { getQueuedSales, queueSale, removeQueuedSale, isNetworkFailure } from "@/lib/pos-offline-queue";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { BarcodeScannerModal } from "@/components/pos/barcode-scanner-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { mapSalesInvoiceRow, type Customer, type SalesInvoice } from "@/lib/types";
import { istDateString } from "@/lib/ist-date";

const TENDER_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card"];
const QUICK_DISCOUNTS = [0, 5, 10, 20];
const PINNED_PRODUCTS_KEY = "posPinnedProducts";

// Deterministic per-product color accent (hashed from id) — purely visual, so the product grid
// reads as a real tap-friendly POS tile board instead of a flat list of identical gray cards.
// No product data needed (no category field on Product yet), so this is the simplest way to
// give each tile its own identity while staying stable across reloads for the same product.
// Each entry pairs the tile's left-border stripe with a matching background/text pair for its
// initials avatar (see ProductThumb) — same color family, so the avatar isn't a second,
// unrelated color fighting the stripe it sits next to.
const TILE_ACCENTS = [
  { border: "border-l-rose-400 dark:border-l-rose-500", avatar: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  { border: "border-l-amber-400 dark:border-l-amber-500", avatar: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  { border: "border-l-emerald-400 dark:border-l-emerald-500", avatar: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  { border: "border-l-sky-400 dark:border-l-sky-500", avatar: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  { border: "border-l-violet-400 dark:border-l-violet-500", avatar: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  { border: "border-l-fuchsia-400 dark:border-l-fuchsia-500", avatar: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300" },
  { border: "border-l-teal-400 dark:border-l-teal-500", avatar: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
  { border: "border-l-orange-400 dark:border-l-orange-500", avatar: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
];

function tileAccent(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_ACCENTS[hash % TILE_ACCENTS.length];
}

/** Initials for a product with no photo — first letter of up to the first two words ("AD Suit
 *  Sep" → "AS"), falling back to the first two characters for a single-word name. */
function productInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || "?").slice(0, 2).toUpperCase();
}

/** A real product photo when one was uploaded (Inventory → product → edit), otherwise a
 *  generated colored-initials square in the same color family as the tile's own border stripe —
 *  gives every tile a visual anchor to recognize at a glance instead of reading text, without
 *  requiring every product to have a real photo first. */
function ProductThumb({ product, size = "size-10" }: { product: { id: string; name: string; imageDataUrl?: string | null }; size?: string }) {
  if (product.imageDataUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- small inline data URL thumbnail, not worth next/image's overhead
    return <img src={product.imageDataUrl} alt="" className={`${size} shrink-0 rounded-md object-cover`} />;
  }
  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-md text-xs font-bold ${tileAccent(product.id).avatar}`}>
      {productInitials(product.name)}
    </div>
  );
}

interface CartLine {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  /** Per-line quick discount, 0-100 — see QUICK_DISCOUNTS. */
  discountPercent: number;
}

function lineAmount(line: CartLine) {
  return Math.round(line.qty * line.unitPrice * (1 - (line.discountPercent || 0) / 100) * 100) / 100;
}

interface HeldSale {
  id: string;
  label: string;
  cart: CartLine[];
  customer: Customer | null;
  heldAt: string;
}

function OpenRegisterGate() {
  const { data: user } = useCurrentUser();
  const { data: lastClosed } = useLastClosedSession();
  const openRegister = useOpenRegister();
  const [opening, setOpening] = useState(0);

  async function handleOpen() {
    try {
      await openRegister.mutateAsync({ openingCash: opening || 0, userEmail: user?.email });
      toast.success("Register opened");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open register");
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 p-10 text-center">
      <Lock className="size-10 text-muted-foreground" />
      <div>
        <h2 className="text-lg font-semibold">Register is closed</h2>
        <p className="text-sm text-muted-foreground">Enter today&apos;s opening cash to start selling.</p>
      </div>
      <NumberInput min={0} step={0.01} className="text-center" value={opening} onChange={setOpening} />
      <Button className="w-full" onClick={handleOpen} disabled={openRegister.isPending}>
        <Unlock className="size-4" /> {openRegister.isPending ? "Opening…" : "Open Register"}
      </Button>
      {lastClosed?.notes && (
        <div className="w-full rounded-lg border bg-muted/40 p-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note from last shift</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{lastClosed.notes}</p>
        </div>
      )}
    </div>
  );
}

function CloseRegisterDialog({ open, onOpenChange, sessionId, openingCash }: { open: boolean; onOpenChange: (v: boolean) => void; sessionId: string; openingCash: number }) {
  const { data: cashSales } = useSessionCashTotal(open ? sessionId : undefined);
  const closeRegister = useCloseRegister();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");

  const expected = openingCash + (cashSales || 0);
  const countedNum = parseFloat(counted) || 0;
  const variance = counted ? countedNum - expected : 0;

  async function handleClose() {
    try {
      await closeRegister.mutateAsync({ sessionId, closingCash: countedNum, expectedCash: expected, notes });
      toast.success("Register closed");
      onOpenChange(false);
      setCounted("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to close register");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Close Register</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border">
            <div className="min-w-0 bg-card p-2 text-center sm:p-3">
              <p className="truncate text-base font-semibold tabular-nums sm:text-lg">{inr(openingCash)}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Opening cash</p>
            </div>
            <div className="min-w-0 bg-card p-2 text-center sm:p-3">
              <p className="truncate text-base font-semibold tabular-nums sm:text-lg">{inr(expected)}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Expected cash</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Counted cash</label>
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
          </div>
          {counted && (
            <p className={`text-sm font-medium ${variance === 0 ? "text-muted-foreground" : variance > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {variance === 0 ? "Matches exactly" : variance > 0 ? `₹${variance.toFixed(2)} over` : `₹${Math.abs(variance).toFixed(2)} short`}
            </p>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Handover note for the next shift (optional)</label>
            <Textarea placeholder="e.g. ₹500 taken to bank, register float short by ₹20" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleClose} disabled={closeRegister.isPending || !counted}>
            {closeRegister.isPending ? "Closing…" : "Close Register"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeldSalesDialog({
  open,
  onOpenChange,
  heldSales,
  onResume,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  heldSales: HeldSale[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Held Sales</DialogTitle>
        </DialogHeader>
        {heldSales.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sales on hold.</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {heldSales.map((h) => {
              const lineTotal = h.cart.reduce((s, c) => s + lineAmount(c), 0);
              return (
                <div key={h.id} className="flex items-center gap-2 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{h.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.cart.length} item{h.cart.length === 1 ? "" : "s"} · {inr(lineTotal)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => onResume(h.id)}>Resume</Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => onDiscard(h.id)} aria-label="Discard held sale">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ReturnableInvoice {
  id: string;
  invoiceNumber: string;
  customerMobile: string;
  items: SalesLineItem[];
}

function ReturnDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [looking, setLooking] = useState(false);
  const [invoice, setInvoice] = useState<ReturnableInvoice | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const raiseCredit = useRaiseSalesCreditNote();

  function reset() {
    setInvoiceNumber("");
    setInvoice(null);
    setReturnQtys({});
    setReason("");
  }

  async function lookupInvoice() {
    const number = invoiceNumber.trim();
    if (!number) return;
    setLooking(true);
    setInvoice(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from("sales_invoices").select("*").eq("invoice_number", number).maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error(`No invoice found for "${number}"`);
        return;
      }
      const row = mapSalesInvoiceRow(data) as SalesInvoice;
      setInvoice({ id: row.id, invoiceNumber: row.invoiceNumber, customerMobile: row.customerMobile, items: row.items });
      setReturnQtys(Object.fromEntries(row.items.map((it, idx) => [idx, it.qty])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not look up that invoice");
    } finally {
      setLooking(false);
    }
  }

  const returnItems = useMemo(() => {
    if (!invoice) return [];
    return invoice.items
      .map((it, idx) => {
        const qty = Math.max(0, Math.min(it.qty, returnQtys[idx] ?? 0));
        if (qty <= 0) return null;
        const unitAfterLineDiscount = it.qty > 0 ? it.amount / it.qty : it.unitPrice;
        return { productId: it.productId, productName: it.productName, qty, unitPrice: it.unitPrice, discountPercent: 0, amount: Math.round(unitAfterLineDiscount * qty * 100) / 100 };
      })
      .filter((x): x is SalesLineItem => x !== null);
  }, [invoice, returnQtys]);
  const refundTotal = computeLineItemsTotal(returnItems);

  async function submitReturn() {
    if (!invoice) return;
    if (returnItems.length === 0) return toast.error("Select at least one item to return");
    try {
      await raiseCredit.mutateAsync({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerMobile: invoice.customerMobile,
        creditNumber: genSalesCreditNumber(),
        date: istDateString(),
        items: returnItems,
        reason: reason.trim() || "POS return",
        notes: "",
      });
      hapticSuccess();
      toast.success(`Credit note issued · ${inr(refundTotal)}`);
      onOpenChange(false);
      reset();
    } catch (e) {
      hapticError();
      toast.error(e instanceof Error ? e.message : "Failed to raise credit note");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return / Exchange</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Invoice number (e.g. INV-20261026-123456)"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupInvoice()}
              autoFocus
            />
            <Button variant="outline" onClick={lookupInvoice} disabled={looking || !invoiceNumber.trim()}>
              {looking ? "..." : "Find"}
            </Button>
          </div>

          {invoice && (
            <>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-2">
                {invoice.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{it.productName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">of {it.qty}</span>
                    <NumberInput
                      min={0}
                      max={it.qty}
                      step={1}
                      className="h-8 w-16"
                      value={returnQtys[idx] ?? 0}
                      onChange={(v) => setReturnQtys((q) => ({ ...q, [idx]: Math.max(0, Math.min(it.qty, v)) }))}
                    />
                  </div>
                ))}
              </div>
              <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <span className="text-sm font-medium">Refund as credit note</span>
                <span className="text-lg font-bold tabular-nums text-primary">{inr(refundTotal)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                For an exchange, issue the return here, then ring up the new items as a normal sale — the credit note is the customer&apos;s refund value to apply against it.
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submitReturn} disabled={!invoice || raiseCredit.isPending || returnItems.length === 0}>
            {raiseCredit.isPending ? "Issuing…" : "Issue Credit Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface QuickAddProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sellingPrice: number;
}

/** Paste/scan a batch of SKUs (one per line, optionally "SKU x3" for a quantity) and build the
 *  whole cart in one shot — for phone/WhatsApp pre-orders being collected in person, where
 *  someone already typed up the item list elsewhere and retyping it into the scan box one line
 *  at a time is pure friction. */
function QuickAddDialog({
  open,
  onOpenChange,
  products,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: QuickAddProduct[];
  onAdd: (lines: { product: QuickAddProduct; qty: number }[]) => void;
}) {
  const [text, setText] = useState("");

  function parseAndAdd() {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const resolved: { product: QuickAddProduct; qty: number }[] = [];
    const notFound: string[] = [];
    for (const line of lines) {
      const match = line.match(/^(.+?)(?:\s*[x×]\s*(\d+))?$/i);
      const code = (match?.[1] || line).trim();
      const qty = match?.[2] ? parseInt(match[2], 10) : 1;
      const product = products.find((p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase());
      if (product) resolved.push({ product, qty: qty > 0 ? qty : 1 });
      else notFound.push(code);
    }

    if (resolved.length > 0) onAdd(resolved);
    if (notFound.length > 0) toast.error(`Not found: ${notFound.join(", ")}`);
    if (resolved.length > 0) {
      onOpenChange(false);
      setText("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Quick Add from List</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">One SKU or barcode per line. Add &quot; x3&quot; for a quantity.</p>
          <Textarea placeholder={"AD-0001 x2\nMI-0001\nOLD"} value={text} onChange={(e) => setText(e.target.value)} rows={8} className="font-mono text-sm" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={parseAndAdd} disabled={!text.trim()}>Add to Cart</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PosScreen({ sessionId, openingCash }: { sessionId: string; openingCash: number }) {
  const { data: user } = useCurrentUser();
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: shop } = useShopSettings();
  const { data: salesSummary } = useSessionSalesSummary(sessionId);
  const { data: loyaltyCfg } = useLoyaltyConfig();
  const { data: pinnedIds, save: savePinned } = useAppSetting<string[]>(PINNED_PRODUCTS_KEY, []);
  const saveInvoice = useSaveInvoice();
  const qc = useQueryClient();

  const [scanValue, setScanValue] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [qtyPreset, setQtyPreset] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [tenders, setTenders] = useState<{ method: string; amount: string }[]>([{ method: "Cash", amount: "" }]);
  const [saleDiscountType, setSaleDiscountType] = useState<DiscountType>("percent");
  const [saleDiscountValue, setSaleDiscountValue] = useState("");
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoPrint, setAutoPrint] = useState(true);
  const [lastReceipt, setLastReceipt] = useState<Parameters<typeof printThermalReceipt>[0] | null>(null);
  const [appliedLoyalty, setAppliedLoyalty] = useState<{ discount: number; ptsUsed: number } | null>(null);
  const [redeemingPoints, setRedeemingPoints] = useState(false);
  const [queuedCount, setQueuedCount] = useState(() => getQueuedSales().length);
  const scanRef = useRef<HTMLInputElement>(null);
  // Set once per checkout attempt and reused across retries of the SAME sale (a network
  // timeout where the first request may have actually gone through) — only cleared after a
  // successful sale or a fresh page load, never regenerated on retry. See the API route's
  // idempotencyKey handling (add_invoice_idempotency_key.sql).
  const idempotencyKeyRef = useRef<string | null>(null);

  const pinnedSet = useMemo(() => new Set(pinnedIds || []), [pinnedIds]);
  const pinnedProducts = useMemo(() => (products || []).filter((p) => p.active && pinnedSet.has(p.id)), [products, pinnedSet]);

  function togglePinned(productId: string) {
    const current = pinnedIds || [];
    const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
    savePinned.mutate(next);
  }

  const lineItems = useMemo<SalesLineItem[]>(
    () =>
      cart.map((c) => ({
        productId: c.productId,
        productName: c.productName,
        qty: c.qty,
        unitPrice: c.unitPrice,
        discountPercent: c.discountPercent || 0,
        amount: lineAmount(c),
      })),
    [cart]
  );
  const subtotal = useMemo(() => computeLineItemsTotal(lineItems), [lineItems]);
  const saleDiscountNum = parseFloat(saleDiscountValue) || 0;
  const totals = useMemo(() => computeInvoiceTotals(lineItems, 0, saleDiscountType, saleDiscountNum, 0, "none"), [lineItems, saleDiscountType, saleDiscountNum]);
  const total = totals.total;
  const tenderTotal = tenders.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0) + (appliedLoyalty?.discount || 0);
  const remaining = Math.max(0, Math.round((total - tenderTotal) * 100) / 100);

  const categories = useMemo(() => Array.from(new Set((products || []).filter((p) => p.active).map((p) => p.category).filter(Boolean))).sort(), [products]);

  // Available once a real (non walk-in) customer with enough points is picked. Computed against
  // what's left to pay BEFORE this redemption, same as the stitching-order flow.
  const beforeLoyaltyRemaining = Math.max(0, Math.round((total - tenders.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)) * 100) / 100);
  const redemptionPreview = useMemo(
    () => (customer && loyaltyCfg?.enabled && !appliedLoyalty ? computeRedemption(customer.loyaltyPoints, beforeLoyaltyRemaining, loyaltyCfg) : null),
    [customer, loyaltyCfg, beforeLoyaltyRemaining, appliedLoyalty]
  );

  function addProduct(p: { id: string; name: string; sellingPrice: number }, qty = 1) {
    setCart((rows) => {
      const existing = rows.find((r) => r.productId === p.id);
      if (existing) return rows.map((r) => (r.productId === p.id ? { ...r, qty: r.qty + qty } : r));
      return [...rows, { productId: p.id, productName: p.name, qty, unitPrice: p.sellingPrice, discountPercent: 0 }];
    });
  }

  /** Tile click handler — adds the qty typed into the "Qty" box (quantity-first entry), or 1. */
  function handleTileAdd(p: { id: string; name: string; sellingPrice: number }) {
    const preset = parseInt(qtyPreset, 10);
    addProduct(p, preset > 0 ? preset : 1);
    if (qtyPreset) setQtyPreset("");
  }

  function updateLineDiscount(productId: string, discountPercent: number) {
    setCart((rows) => rows.map((r) => (r.productId === productId ? { ...r, discountPercent } : r)));
  }

  function holdSale() {
    if (cart.length === 0) return;
    const label = customer ? customer.name : `Walk-in · ${cart.length} item${cart.length === 1 ? "" : "s"}`;
    setHeldSales((h) => [...h, { id: crypto.randomUUID(), label, cart, customer, heldAt: new Date().toISOString() }]);
    setCart([]);
    setCustomer(null);
    setSaleDiscountValue("");
    toast.success("Sale held — start a new one, or resume it from Held Sales");
    scanRef.current?.focus();
  }

  function resumeHeldSale(id: string) {
    const held = heldSales.find((h) => h.id === id);
    if (!held) return;
    if (cart.length > 0) {
      // The in-progress cart would otherwise just vanish — park it too, so nothing is lost.
      const label = customer ? customer.name : `Walk-in · ${cart.length} item${cart.length === 1 ? "" : "s"}`;
      setHeldSales((h) => [...h.filter((x) => x.id !== id), { id: crypto.randomUUID(), label, cart, customer, heldAt: new Date().toISOString() }]);
    } else {
      setHeldSales((h) => h.filter((x) => x.id !== id));
    }
    setCart(held.cart);
    setCustomer(held.customer);
    setHeldOpen(false);
    scanRef.current?.focus();
  }

  function discardHeldSale(id: string) {
    setHeldSales((h) => h.filter((x) => x.id !== id));
  }

  async function applyLoyaltyRedemption() {
    if (!customer || !redemptionPreview?.canRedeem) return;
    setRedeemingPoints(true);
    try {
      const res = await fetch("/api/pos/redeem-loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: customer.mobile, name: customer.name, maxDiscount: beforeLoyaltyRemaining, invoiceNumber: `pending-${Date.now()}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not redeem points");
      setAppliedLoyalty({ discount: data.discount, ptsUsed: data.ptsUsed });
      toast.success(`Applied ${inr(data.discount)} from ${data.ptsUsed} points`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not redeem points");
    } finally {
      setRedeemingPoints(false);
    }
  }

  async function undoLoyaltyRedemption() {
    if (!appliedLoyalty || !customer) return;
    const { ptsUsed } = appliedLoyalty;
    setAppliedLoyalty(null);
    try {
      await fetch("/api/pos/undo-redeem-loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: customer.mobile, name: customer.name, pts: ptsUsed, invoiceNumber: "cancelled-before-checkout" }),
      });
    } catch {
      toast.error("Could not return the points automatically — ask an admin to credit them back manually.");
    }
  }

  async function generateBarcode(p: { id: string; name: string; sku: string; sellingPrice: number }) {
    try {
      const res = await fetch(`/api/inventory/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: p.name, barcode: p.sku }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not generate a barcode");
      printBarcodeLabel({ name: p.name, sku: p.sku, barcode: p.sku, sellingPrice: p.sellingPrice });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate a barcode");
    }
  }

  function sendReceiptWhatsApp() {
    if (!lastReceipt || !customer?.mobile) return;
    const itemLines = lastReceipt.items.map((i) => `${i.productName} ×${i.qty} — ${inr(i.amount)}`).join("\n");
    const message =
      `Dear ${customer.name} 🙏\n\nYour receipt — *${lastReceipt.invoiceNumber}*\n\n${itemLines}\n\n*Total: ${inr(lastReceipt.total)}*` +
      ((lastReceipt.balance || 0) > 0 ? `\nBalance due: ${inr(lastReceipt.balance || 0)}` : `\nPaid in full — thank you!`) +
      `\n\n_${shop?.name || ""}_`;
    window.open(`https://wa.me/91${customer.mobile.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(message)}`, "_blank");
  }

  function lookupAndAdd(code: string) {
    const match = (products || []).find((p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase());
    if (match) {
      addProduct(match);
      return true;
    }
    toast.error(`No product matches "${code}"`);
    return false;
  }

  function handleScanSubmit(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = scanValue.trim();
    if (!code) return;
    if (lookupAndAdd(code)) setScanValue("");
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((rows) => rows.filter((r) => r.productId !== productId));
      return;
    }
    setCart((rows) => rows.map((r) => (r.productId === productId ? { ...r, qty } : r)));
  }

  function removeLine(productId: string) {
    setCart((rows) => rows.filter((r) => r.productId !== productId));
  }

  function addTenderLine() {
    setTenders((t) => [...t, { method: "Cash", amount: remaining > 0 ? String(remaining) : "" }]);
  }

  function updateTender(index: number, patch: Partial<{ method: string; amount: string }>) {
    setTenders((t) => t.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeTender(index: number) {
    setTenders((t) => t.filter((_, i) => i !== index));
  }

  // Replays queued offline sales (see lib/pos-offline-queue.ts) — each carries the exact
  // idempotencyKey it was first submitted with, so a sale that actually reached the server
  // before the connection dropped is recognized and skipped rather than double-booked.
  async function flushOfflineQueue() {
    const queue = getQueuedSales();
    if (queue.length === 0) return;
    for (const sale of queue) {
      try {
        await saveInvoice.mutateAsync(sale.input as unknown as SaveInvoiceInput);
        removeQueuedSale(sale.idempotencyKey);
      } catch (e) {
        if (!isNetworkFailure(e)) {
          // The server actually rejected it (not just unreachable) — retrying forever would
          // never succeed, so surface it instead of silently queuing it indefinitely.
          removeQueuedSale(sale.idempotencyKey);
          toast.error(`Queued sale ${sale.summaryLabel} failed to sync: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }
    }
    setQueuedCount(getQueuedSales().length);
  }

  useEffect(() => {
    // setTimeout (not a direct call) so the lint rule that forbids synchronous setState from an
    // effect body doesn't trip on flushOfflineQueue's eventual setQueuedCount — the queue read
    // and any resulting state update only ever happen after this effect has already committed.
    const timer = setTimeout(flushOfflineQueue, 0);
    window.addEventListener("online", flushOfflineQueue);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", flushOfflineQueue);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function completeSale() {
    if (cart.length === 0) return toast.error("Cart is empty");
    // A partial payment leaves a balance on the invoice, same as any other sales invoice —
    // but that balance has to be traceable to a real customer to ever get collected, so a
    // walk-in sale (shared "walk-in" mobile, no real contact) must be paid in full.
    if (tenderTotal < total && !customer) {
      return toast.error("Select a customer to accept a partial payment — walk-in sales must be paid in full.");
    }
    setSubmitting(true);
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    const invoiceNumber = genInvoiceNumber();
    const invoiceDate = istDateString();
    // Invoice + stock ledger + payment(s) all commit as one atomic write (see the
    // save_sales_invoice RPC) — previously the payment(s) were recorded in a separate loop
    // of calls after the invoice save, so a network drop between them could leave stock
    // deducted with no matching payment recorded, or one tender saved and a later one lost.
    const payments = tenders
      .map((t) => ({ amount: parseFloat(t.amount) || 0, method: t.method }))
      .filter((t) => t.amount > 0)
      .map((t) => ({ amount: t.amount, method: t.method, date: istDateString(), note: "POS sale", posSessionId: sessionId }));
    if (appliedLoyalty) payments.push({ amount: appliedLoyalty.discount, method: "Loyalty Points", date: istDateString(), note: `${appliedLoyalty.ptsUsed} pts redeemed`, posSessionId: sessionId });

    const input: SaveInvoiceInput = {
      invoiceNumber,
      customerMobile: customer?.mobile || "walk-in",
      customerName: customer?.name || "Walk-in customer",
      invoiceDate,
      items: lineItems,
      subject: "POS sale",
      shippingCharges: 0,
      discountType: saleDiscountType,
      discountValue: saleDiscountNum,
      gstType: "none",
      taxRate: 0,
      docStatus: "sent",
      terms: "",
      notes: "",
      userEmail: user?.email,
      payments,
      idempotencyKey: idempotencyKeyRef.current,
    };

    try {
      await saveInvoice.mutateAsync(input);
      hapticSuccess();
      const balanceDue = Math.max(0, Math.round((totals.total - tenderTotal) * 100) / 100);
      toast.success(balanceDue > 0 ? `Sale complete · ${invoiceNumber} · ${inr(balanceDue)} balance due` : `Sale complete · ${invoiceNumber} · ${inr(totals.total)}`);

      const receipt = {
        shopName: shop?.name || "",
        shopPhone: shop?.phone || "",
        logoDataUrl: shop?.logoDataUrl,
        invoiceNumber,
        date: invoiceDate,
        customerName: customer?.name,
        items: lineItems,
        total: totals.total,
        paid: tenderTotal,
        balance: balanceDue,
        paymentMethod: payments.map((t) => t.method).join(" + "),
        paperWidthMm: shop?.receiptPaperWidthMm,
      };
      setLastReceipt(receipt);
      if (autoPrint) printThermalReceipt(receipt);

      idempotencyKeyRef.current = null;
      setCart([]);
      setCustomer(null);
      setTenders([{ method: "Cash", amount: "" }]);
      setSaleDiscountValue("");
      setAppliedLoyalty(null);
      scanRef.current?.focus();
    } catch (e) {
      if (isNetworkFailure(e)) {
        // Server unreachable, not rejected — queue it. The sale is "done" from the cashier's
        // point of view (cart clears, offline receipt prints) and syncs automatically once back
        // online (see flushOfflineQueue), deduped by the idempotencyKey already set above.
        queueSale({
          idempotencyKey: idempotencyKeyRef.current!,
          queuedAt: new Date().toISOString(),
          input: input as unknown as Record<string, unknown>,
          summaryLabel: `${invoiceNumber} (${inr(totals.total)})`,
        });
        setQueuedCount(getQueuedSales().length);
        hapticSuccess();
        toast.success(`Offline — sale queued · ${invoiceNumber} · will sync automatically`);
        const receipt = {
          shopName: shop?.name || "",
          shopPhone: shop?.phone || "",
          logoDataUrl: shop?.logoDataUrl,
          invoiceNumber: `${invoiceNumber} (offline — pending sync)`,
          date: invoiceDate,
          customerName: customer?.name,
          items: lineItems,
          total: totals.total,
          paid: tenderTotal,
          balance: Math.max(0, Math.round((totals.total - tenderTotal) * 100) / 100),
          paymentMethod: payments.map((t) => t.method).join(" + "),
          paperWidthMm: shop?.receiptPaperWidthMm,
        };
        setLastReceipt(receipt);
        if (autoPrint) printThermalReceipt(receipt);
        idempotencyKeyRef.current = null;
        setCart([]);
        setCustomer(null);
        setTenders([{ method: "Cash", amount: "" }]);
        setSaleDiscountValue("");
        setAppliedLoyalty(null);
        scanRef.current?.focus();
      } else {
        hapticError();
        toast.error(e instanceof Error ? e.message : "Failed to complete sale");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const filteredProducts = useMemo(() => {
    // Archived products are discontinued — don't let them come up at checkout.
    const active = (products || []).filter((p) => p.active && (!categoryFilter || p.category === categoryFilter));
    const q = scanValue.trim().toLowerCase();
    if (!q) return active.slice(0, 24);
    return active.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode === q).slice(0, 24);
  }, [products, scanValue, categoryFilter]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="POS"
        description="Fast checkout — scan or search, then take payment"
        actions={
          <>
            {queuedCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <WifiOff className="size-3.5" /> {queuedCount} offline sale{queuedCount === 1 ? "" : "s"} pending
              </span>
            )}
            {salesSummary && (
              <span className="hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium tabular-nums sm:flex">
                <span className="text-muted-foreground">Today</span>
                <span>{salesSummary.count} sale{salesSummary.count === 1 ? "" : "s"}</span>
                <span className="text-emerald-700 dark:text-emerald-400">{inr(salesSummary.total)}</span>
              </span>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} className="size-3.5" />
              Auto-print receipt
            </label>
            {lastReceipt && (
              <Button variant="outline" size="sm" onClick={() => printThermalReceipt(lastReceipt)}>
                <Printer className="size-4" /> Reprint Last
              </Button>
            )}
            {lastReceipt && customer?.mobile && (
              <Button variant="outline" size="sm" onClick={sendReceiptWhatsApp}>
                <MessageCircle className="size-4" /> Send Receipt
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setQuickAddOpen(true)}>
              <ListPlus className="size-4" /> Quick Add List
            </Button>
            {user?.perms.manageCreditNotes && (
              <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
                <Undo2 className="size-4" /> Return
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setHeldOpen(true)}>
              <PlayCircle className="size-4" /> Held{heldSales.length > 0 ? ` (${heldSales.length})` : ""}
            </Button>
            <Button variant="outline" size="sm" onClick={holdSale} disabled={cart.length === 0}>
              <PauseCircle className="size-4" /> Hold Sale
            </Button>
            {user?.perms.closeRegister && (
              <Button variant="outline" onClick={() => setCloseOpen(true)}>
                <Lock className="size-4" /> Close Register
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* Left: scan/search + product grid */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={scanRef}
                autoFocus
                placeholder="Scan barcode or search product name/SKU…"
                className="h-11 pl-9 text-base"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={handleScanSubmit}
              />
            </div>
            {/* Quantity-first entry: type a count here, then tap a tile to add that many at
                once instead of tapping the same tile N times. Clears itself after one use. */}
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="Qty"
              title="Type a quantity, then tap a product to add that many"
              className="h-11 w-16 text-center text-base"
              value={qtyPreset}
              onChange={(e) => setQtyPreset(e.target.value)}
            />
            <Button type="button" variant="outline" size="lg" className="h-11 px-3" onClick={() => setScannerOpen(true)} aria-label="Scan with camera">
              <Camera className="size-4" />
            </Button>
          </div>

          {pinnedProducts.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Star className="size-3 fill-amber-400 text-amber-500" /> Favourites
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pinnedProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleTileAdd(p)}
                    className={`flex min-w-[9rem] shrink-0 items-center gap-2 rounded-lg border border-l-4 bg-card p-2.5 text-left transition-colors hover:bg-muted/50 active:bg-muted ${tileAccent(p.id).border}`}
                  >
                    <ProductThumb product={p} size="size-9" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{p.name}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{inr(p.sellingPrice)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${!categoryFilter ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${categoryFilter === c ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {productsLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <EmptyState icon={ScanBarcode} title="No matching products" description="Try a different search, or add products in Inventory." />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredProducts.map((p) => {
                const outOfStock = p.stockQty <= 0;
                const lowStock = !outOfStock && isLowStock(p.stockQty, p.lowStockAlert);
                const pinned = pinnedSet.has(p.id);
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleTileAdd(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleTileAdd(p);
                      }
                    }}
                    className={`relative min-w-0 cursor-pointer rounded-lg border border-l-4 bg-card p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted ${tileAccent(p.id).border}`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePinned(p.id);
                      }}
                      aria-label={pinned ? `Remove ${p.name} from favourites` : `Add ${p.name} to favourites`}
                      className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:bg-background"
                    >
                      <Star className={cn("size-3.5", pinned && "fill-amber-400 text-amber-500")} />
                    </button>
                    <div className="flex items-start gap-2 pr-5">
                      <ProductThumb product={p} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{p.sku}</p>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{inr(p.sellingPrice)}</p>
                      {outOfStock ? (
                        <Badge variant="destructive" className="shrink-0">Out</Badge>
                      ) : lowStock ? (
                        <Badge className="shrink-0 border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" variant="outline">
                          {p.stockQty} left
                        </Badge>
                      ) : null}
                    </div>
                    {!p.barcode && user?.perms.manageInventory && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateBarcode(p);
                        }}
                        className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <Tag className="size-3" /> Generate & print label
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: cart + checkout */}
        <div className="space-y-3 lg:sticky lg:top-4">
          <Card className="p-4">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className={`mb-3 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${customer ? "border-primary/30 bg-primary/5 hover:bg-primary/10" : "bg-muted/40 hover:bg-muted/60"}`}
            >
              <User className={`size-4 shrink-0 ${customer ? "text-primary" : "text-muted-foreground"}`} />
              <span className="min-w-0 flex-1 truncate text-sm">{customer ? `${customer.name} · ${customer.mobile}` : "Walk-in customer"}</span>
              {customer && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomer(null);
                  }}
                  className="shrink-0 rounded p-0.5 hover:bg-background"
                >
                  <X className="size-3.5" />
                </span>
              )}
            </button>

            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Cart is empty — scan or tap a product to add it.</p>
            ) : (
              <div className="space-y-2">
                {cart.map((line) => {
                  // Advisory only, same as the invoice line-item editor — a shop selling a
                  // made-to-order/service item with no real stock tracking must still check out.
                  const stockQty = products?.find((p) => p.id === line.productId)?.stockQty;
                  const oversell = stockQty !== undefined && line.qty > stockQty;
                  return (
                  <div key={line.productId} className="rounded-lg border p-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{line.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {inr(line.unitPrice)} each{line.discountPercent > 0 ? ` · ${line.discountPercent}% off` : ""}
                        </p>
                        {oversell && <p className="text-[11px] text-amber-600 dark:text-amber-500">Only {stockQty} in stock</p>}
                      </div>
                      <div
                        className="flex shrink-0 items-center gap-1"
                        tabIndex={0}
                        role="group"
                        aria-label={`Quantity for ${line.productName} — use arrow keys to adjust, Delete to remove`}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "+") {
                            e.preventDefault();
                            updateQty(line.productId, line.qty + 1);
                          } else if (e.key === "ArrowDown" || e.key === "-") {
                            e.preventDefault();
                            updateQty(line.productId, line.qty - 1);
                          } else if (e.key === "Delete" || e.key === "Backspace") {
                            e.preventDefault();
                            removeLine(line.productId);
                          }
                        }}
                      >
                        <Button variant="outline" size="icon-sm" className="size-11 sm:size-7" onClick={() => updateQty(line.productId, line.qty - 1)} aria-label="Decrease quantity">
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                        <Button variant="outline" size="icon-sm" className="size-11 sm:size-7" onClick={() => updateQty(line.productId, line.qty + 1)} aria-label="Increase quantity">
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{inr(lineAmount(line))}</span>
                      <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={() => removeLine(line.productId)} aria-label={`Remove ${line.productName}`}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1 pl-0.5">
                      <Percent className="size-3 shrink-0 text-muted-foreground" />
                      {QUICK_DISCOUNTS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => updateLineDiscount(line.productId, d)}
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${line.discountPercent === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          {d === 0 ? "No disc." : `${d}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 space-y-1.5 rounded-lg bg-primary/10 p-3 dark:bg-primary/15">
              {saleDiscountNum > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs text-primary/80">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{inr(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-primary/80">
                    <span>Discount</span>
                    <span className="tabular-nums">−{inr(totals.discountAmount)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-primary">Total</span>
                <span className="text-xl font-bold tabular-nums text-primary">{inr(total)}</span>
              </div>
            </div>
          </Card>

          <Card className="space-y-3 border-l-4 border-l-primary/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment</p>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sale discount</span>
              <select
                className="h-8 rounded-md border bg-background px-1.5 text-xs"
                value={saleDiscountType}
                onChange={(e) => setSaleDiscountType(e.target.value as DiscountType)}
              >
                <option value="percent">%</option>
                <option value="flat">₹</option>
              </select>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="h-8 w-20"
                placeholder="0"
                value={saleDiscountValue}
                onChange={(e) => setSaleDiscountValue(e.target.value)}
              />
            </div>

            {appliedLoyalty ? (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <Gift className="size-3.5 text-primary" /> Loyalty points applied · {appliedLoyalty.ptsUsed} pts
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">−{inr(appliedLoyalty.discount)}</span>
                  <Button variant="ghost" size="icon-sm" className="size-7" onClick={undoLoyaltyRedemption} aria-label="Remove loyalty points redemption">
                    <X className="size-3.5" />
                  </Button>
                </span>
              </div>
            ) : (
              redemptionPreview?.canRedeem && (
                <Button variant="outline" size="sm" className="w-full" onClick={applyLoyaltyRedemption} disabled={redeemingPoints}>
                  <Gift className="size-3.5" />
                  {redeemingPoints ? "Applying…" : `Apply ${inr(redemptionPreview.maxPtDiscount)} loyalty (${redemptionPreview.ptsToRedeem} pts)`}
                </Button>
              )
            )}

            {tenders.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                  value={t.method}
                  onChange={(e) => updateTender(i, { method: e.target.value })}
                >
                  {TENDER_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <Input type="number" inputMode="decimal" min={0} step="0.01" className="w-28" placeholder="Amount" value={t.amount} onChange={(e) => updateTender(i, { amount: e.target.value })} />
                {tenders.length > 1 && (
                  <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={() => removeTender(i)} aria-label="Remove tender line">
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={addTenderLine}>
              <Plus className="size-3.5" /> Split payment
            </Button>

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">{remaining > 0 ? "Balance due" : "Remaining"}</span>
              <span className={remaining > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : "font-semibold text-emerald-600 dark:text-emerald-400"}>{inr(remaining)}</span>
            </div>
            {remaining > 0 && !customer && <p className="text-xs text-muted-foreground">Select a customer above to accept this as a partial payment.</p>}

            <Button className="w-full" size="lg" onClick={completeSale} disabled={submitting || cart.length === 0}>
              {submitting ? "Processing…" : remaining > 0 && customer ? `Complete Sale · ${inr(tenderTotal)} now, ${inr(remaining)} due` : `Complete Sale · ${inr(total)}`}
            </Button>
          </Card>
        </div>
      </div>

      <CustomerPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setCustomer} />
      <CloseRegisterDialog open={closeOpen} onOpenChange={setCloseOpen} sessionId={sessionId} openingCash={openingCash} />
      <BarcodeScannerModal open={scannerOpen} onOpenChange={setScannerOpen} onDetected={lookupAndAdd} />
      <HeldSalesDialog open={heldOpen} onOpenChange={setHeldOpen} heldSales={heldSales} onResume={resumeHeldSale} onDiscard={discardHeldSale} />
      <ReturnDialog open={returnOpen} onOpenChange={setReturnOpen} />
      <QuickAddDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        products={(products || []).filter((p) => p.active)}
        onAdd={(lines) => {
          lines.forEach(({ product, qty }) => addProduct(product, qty));
          toast.success(`Added ${lines.length} item${lines.length === 1 ? "" : "s"} to cart`);
        }}
      />
    </div>
  );
}

export default function PosPage() {
  const { data: session, isLoading } = useOpenPosSession();

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!session) return <OpenRegisterGate />;

  return <PosScreen sessionId={session.id} openingCash={session.openingCash} />;
}
