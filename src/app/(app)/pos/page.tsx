"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ScanBarcode, Camera, Trash2, Plus, Minus, User, X, Lock, Unlock, Printer, PauseCircle, PlayCircle, Undo2, Percent } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useSaveInvoice, useRaiseSalesCreditNote } from "@/hooks/use-sales-mutations";
import { useOpenPosSession, useOpenRegister, useCloseRegister, useSessionCashTotal, useSessionSalesSummary } from "@/hooks/use-pos-session";
import { genInvoiceNumber, genSalesCreditNumber, computeLineItemsTotal, type SalesLineItem } from "@/lib/sales";
import { computeInvoiceTotals, type DiscountType } from "@/lib/invoice-totals";
import { printThermalReceipt } from "@/lib/thermal-receipt";
import { hapticSuccess, hapticError } from "@/lib/haptics";
import { isLowStock } from "@/lib/inventory";
import { inr } from "@/lib/format";
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
import { createClient } from "@/lib/supabase/client";
import { mapSalesInvoiceRow, type Customer, type SalesInvoice } from "@/lib/types";
import { istDateString } from "@/lib/ist-date";

const TENDER_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card"];
const QUICK_DISCOUNTS = [0, 5, 10, 20];

// Deterministic per-product color accent (hashed from id) — purely visual, so the product grid
// reads as a real tap-friendly POS tile board instead of a flat list of identical gray cards.
// No product data needed (no category field on Product yet), so this is the simplest way to
// give each tile its own identity while staying stable across reloads for the same product.
const TILE_ACCENTS = [
  "border-l-rose-400 dark:border-l-rose-500",
  "border-l-amber-400 dark:border-l-amber-500",
  "border-l-emerald-400 dark:border-l-emerald-500",
  "border-l-sky-400 dark:border-l-sky-500",
  "border-l-violet-400 dark:border-l-violet-500",
  "border-l-fuchsia-400 dark:border-l-fuchsia-500",
  "border-l-teal-400 dark:border-l-teal-500",
  "border-l-orange-400 dark:border-l-orange-500",
];

function tileAccent(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_ACCENTS[hash % TILE_ACCENTS.length];
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
    </div>
  );
}

function CloseRegisterDialog({ open, onOpenChange, sessionId, openingCash }: { open: boolean; onOpenChange: (v: boolean) => void; sessionId: string; openingCash: number }) {
  const { data: cashSales } = useSessionCashTotal(open ? sessionId : undefined);
  const closeRegister = useCloseRegister();
  const [counted, setCounted] = useState("");

  const expected = openingCash + (cashSales || 0);
  const countedNum = parseFloat(counted) || 0;
  const variance = counted ? countedNum - expected : 0;

  async function handleClose() {
    try {
      await closeRegister.mutateAsync({ sessionId, closingCash: countedNum, expectedCash: expected });
      toast.success("Register closed");
      onOpenChange(false);
      setCounted("");
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

function PosScreen({ sessionId, openingCash }: { sessionId: string; openingCash: number }) {
  const { data: user } = useCurrentUser();
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: shop } = useShopSettings();
  const { data: salesSummary } = useSessionSalesSummary(sessionId);
  const saveInvoice = useSaveInvoice();

  const [scanValue, setScanValue] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [tenders, setTenders] = useState<{ method: string; amount: string }[]>([{ method: "Cash", amount: "" }]);
  const [saleDiscountType, setSaleDiscountType] = useState<DiscountType>("percent");
  const [saleDiscountValue, setSaleDiscountValue] = useState("");
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoPrint, setAutoPrint] = useState(true);
  const [lastReceipt, setLastReceipt] = useState<Parameters<typeof printThermalReceipt>[0] | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  // Set once per checkout attempt and reused across retries of the SAME sale (a network
  // timeout where the first request may have actually gone through) — only cleared after a
  // successful sale or a fresh page load, never regenerated on retry. See the API route's
  // idempotencyKey handling (add_invoice_idempotency_key.sql).
  const idempotencyKeyRef = useRef<string | null>(null);

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
  const tenderTotal = tenders.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const remaining = Math.max(0, Math.round((total - tenderTotal) * 100) / 100);

  const categories = useMemo(() => Array.from(new Set((products || []).filter((p) => p.active).map((p) => p.category).filter(Boolean))).sort(), [products]);

  function addProduct(p: { id: string; name: string; sellingPrice: number }) {
    setCart((rows) => {
      const existing = rows.find((r) => r.productId === p.id);
      if (existing) return rows.map((r) => (r.productId === p.id ? { ...r, qty: r.qty + 1 } : r));
      return [...rows, { productId: p.id, productName: p.name, qty: 1, unitPrice: p.sellingPrice, discountPercent: 0 }];
    });
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
    try {
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

      await saveInvoice.mutateAsync({
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
      });

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
        paymentMethod: tenders.filter((t) => (parseFloat(t.amount) || 0) > 0).map((t) => t.method).join(" + "),
        paperWidthMm: shop?.receiptPaperWidthMm,
      };
      setLastReceipt(receipt);
      if (autoPrint) printThermalReceipt(receipt);

      idempotencyKeyRef.current = null;
      setCart([]);
      setCustomer(null);
      setTenders([{ method: "Cash", amount: "" }]);
      setSaleDiscountValue("");
      scanRef.current?.focus();
    } catch (e) {
      hapticError();
      toast.error(e instanceof Error ? e.message : "Failed to complete sale");
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
            <Button type="button" variant="outline" size="lg" className="h-11 px-3" onClick={() => setScannerOpen(true)} aria-label="Scan with camera">
              <Camera className="size-4" />
            </Button>
          </div>

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
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className={`min-w-0 rounded-lg border border-l-4 bg-card p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted ${tileAccent(p.id)}`}
                  >
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.sku}</p>
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
                  </button>
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
