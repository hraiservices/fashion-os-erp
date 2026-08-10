"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ScanBarcode, Camera, Trash2, Plus, Minus, User, X, Lock, Unlock, Printer } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useSaveInvoice, useRecordSalesPayment } from "@/hooks/use-sales-mutations";
import { useOpenPosSession, useOpenRegister, useCloseRegister, useSessionCashTotal } from "@/hooks/use-pos-session";
import { genInvoiceNumber, computeLineItemsTotal, type SalesLineItem } from "@/lib/sales";
import { computeInvoiceTotals } from "@/lib/invoice-totals";
import { printThermalReceipt } from "@/lib/thermal-receipt";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { BarcodeScannerModal } from "@/components/pos/barcode-scanner-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Customer } from "@/lib/types";

const TENDER_METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card"];

interface CartLine {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
}

function OpenRegisterGate() {
  const { data: user } = useCurrentUser();
  const openRegister = useOpenRegister();
  const [opening, setOpening] = useState("0");

  async function handleOpen() {
    try {
      await openRegister.mutateAsync({ openingCash: parseFloat(opening) || 0, userEmail: user?.email });
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
      <Input type="number" min={0} step="0.01" className="text-center" value={opening} onChange={(e) => setOpening(e.target.value)} />
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
            <div className="bg-card p-3 text-center">
              <p className="text-lg font-semibold tabular-nums">{inr(openingCash)}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Opening cash</p>
            </div>
            <div className="bg-card p-3 text-center">
              <p className="text-lg font-semibold tabular-nums">{inr(expected)}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Expected cash</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Counted cash</label>
            <Input type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
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

function PosScreen({ sessionId, openingCash }: { sessionId: string; openingCash: number }) {
  const { data: user } = useCurrentUser();
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: shop } = useShopSettings();
  const saveInvoice = useSaveInvoice();
  const recordPayment = useRecordSalesPayment();

  const [scanValue, setScanValue] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [tenders, setTenders] = useState<{ method: string; amount: string }[]>([{ method: "Cash", amount: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [autoPrint, setAutoPrint] = useState(true);
  const [lastReceipt, setLastReceipt] = useState<Parameters<typeof printThermalReceipt>[0] | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const total = useMemo(() => computeLineItemsTotal(cart.map((c) => ({ productId: c.productId, productName: c.productName, qty: c.qty, unitPrice: c.unitPrice, discountPercent: 0, amount: c.qty * c.unitPrice } as SalesLineItem))), [cart]);
  const tenderTotal = tenders.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const remaining = Math.max(0, Math.round((total - tenderTotal) * 100) / 100);

  function addProduct(p: { id: string; name: string; sellingPrice: number }) {
    setCart((rows) => {
      const existing = rows.find((r) => r.productId === p.id);
      if (existing) return rows.map((r) => (r.productId === p.id ? { ...r, qty: r.qty + 1 } : r));
      return [...rows, { productId: p.id, productName: p.name, qty: 1, unitPrice: p.sellingPrice }];
    });
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
    try {
      const items: SalesLineItem[] = cart.map((c) => ({ productId: c.productId, productName: c.productName, qty: c.qty, unitPrice: c.unitPrice, discountPercent: 0, amount: c.qty * c.unitPrice }));
      const totals = computeInvoiceTotals(items, 0, "flat", 0, 0, "none");
      const invoiceNumber = genInvoiceNumber();
      const invoiceDate = new Date().toISOString().slice(0, 10);
      const invoice = await saveInvoice.mutateAsync({
        invoiceNumber,
        customerMobile: customer?.mobile || "walk-in",
        customerName: customer?.name || "Walk-in customer",
        invoiceDate,
        items,
        subject: "POS sale",
        shippingCharges: 0,
        discountType: "flat",
        discountValue: 0,
        gstType: "none",
        taxRate: 0,
        docStatus: "sent",
        terms: "",
        notes: "",
        userEmail: user?.email,
      });

      for (const t of tenders) {
        const amt = parseFloat(t.amount) || 0;
        if (amt <= 0) continue;
        await recordPayment.mutateAsync({
          invoiceId: invoice.id,
          customerMobile: customer?.mobile || "walk-in",
          invoiceNumber,
          amount: amt,
          method: t.method,
          date: new Date().toISOString().slice(0, 10),
          note: "POS sale",
          posSessionId: sessionId,
          userEmail: user?.email,
        });
      }

      const balanceDue = Math.max(0, Math.round((totals.total - tenderTotal) * 100) / 100);
      toast.success(balanceDue > 0 ? `Sale complete · ${invoiceNumber} · ${inr(balanceDue)} balance due` : `Sale complete · ${invoiceNumber} · ${inr(totals.total)}`);

      const receipt = {
        shopName: shop?.name || "",
        shopPhone: shop?.phone || "",
        invoiceNumber,
        date: invoiceDate,
        customerName: customer?.name,
        items,
        total: totals.total,
        paid: tenderTotal,
        balance: balanceDue,
        paymentMethod: tenders.filter((t) => (parseFloat(t.amount) || 0) > 0).map((t) => t.method).join(" + "),
      };
      setLastReceipt(receipt);
      if (autoPrint) printThermalReceipt(receipt);

      setCart([]);
      setCustomer(null);
      setTenders([{ method: "Cash", amount: "" }]);
      scanRef.current?.focus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete sale");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredProducts = useMemo(() => {
    const q = scanValue.trim().toLowerCase();
    if (!q) return (products || []).slice(0, 24);
    return (products || []).filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode === q).slice(0, 24);
  }, [products, scanValue]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="POS"
        description="Fast checkout — scan or search, then take payment"
        actions={
          <>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} className="size-3.5" />
              Auto-print receipt
            </label>
            {lastReceipt && (
              <Button variant="outline" size="sm" onClick={() => printThermalReceipt(lastReceipt)}>
                <Printer className="size-4" /> Reprint Last
              </Button>
            )}
            <Button variant="outline" onClick={() => setCloseOpen(true)}>
              <Lock className="size-4" /> Close Register
            </Button>
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
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                >
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.sku}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{inr(p.sellingPrice)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: cart + checkout */}
        <div className="space-y-3 lg:sticky lg:top-4">
          <Card className="p-4">
            <button type="button" onClick={() => setPickerOpen(true)} className="mb-3 flex w-full items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-left hover:bg-muted/60">
              <User className="size-4 shrink-0 text-muted-foreground" />
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
                {cart.map((line) => (
                  <div key={line.productId} className="flex items-center gap-2 rounded-lg border p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.productName}</p>
                      <p className="text-xs text-muted-foreground">{inr(line.unitPrice)} each</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="icon-sm" onClick={() => updateQty(line.productId, line.qty - 1)} aria-label="Decrease quantity">
                        <Minus className="size-3" />
                      </Button>
                      <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                      <Button variant="outline" size="icon-sm" onClick={() => updateQty(line.productId, line.qty + 1)} aria-label="Increase quantity">
                        <Plus className="size-3" />
                      </Button>
                    </div>
                    <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{inr(line.qty * line.unitPrice)}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeLine(line.productId)} aria-label={`Remove ${line.productName}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-lg bg-muted/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Total</span>
                <span className="text-xl font-semibold tabular-nums">{inr(total)}</span>
              </div>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment</p>
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
                <Input type="number" min={0} step="0.01" className="w-28" placeholder="Amount" value={t.amount} onChange={(e) => updateTender(i, { amount: e.target.value })} />
                {tenders.length > 1 && (
                  <Button variant="ghost" size="icon-sm" onClick={() => removeTender(i)} aria-label="Remove tender line">
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
