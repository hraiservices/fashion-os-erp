"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, User2, FileText, Package2, ChevronDown, Truck, Tag, Receipt } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { useSalesQuotation } from "@/hooks/use-sales-quotations";
import { useSalesInvoice } from "@/hooks/use-sales-invoices";
import { useSaveInvoice } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAppSetting } from "@/hooks/use-app-setting";
import { genInvoiceNumber } from "@/lib/sales";
import { GST_TYPE_LABELS, type GstType } from "@/lib/gst";
import { computeInvoiceTotals, type DiscountType } from "@/lib/invoice-totals";
import { PAYMENT_TERMS, PAYMENT_TERM_LABELS, dueDateFromTerm, type PaymentTerm } from "@/lib/payment-terms";
import { DEFAULT_INVOICE_TERMS } from "@/lib/invoice-settings";
import { inr } from "@/lib/format";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerPicker, CustomerPickerTrigger } from "@/components/sales/customer-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { ProductLineItemsEditor, salesLinesToItems, blankSalesLine, type EditableSalesLine } from "@/components/sales/product-line-items-editor";
import { usePriceListItemsMap } from "@/hooks/use-price-lists";
import { DEFAULT_DOCUMENT_NUMBERING, type DocumentNumberingSettings } from "@/lib/document-numbering";
import type { Customer, SalesInvoice, InvoiceDocStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

const gstTypeLabel = (v: unknown) => GST_TYPE_LABELS[v as GstType] ?? "";
const paymentTermLabel = (v: unknown) => PAYMENT_TERM_LABELS[v as PaymentTerm] ?? "";

function blankIfZero(n: number | null | undefined): string {
  return n ? String(n) : "";
}

function placeholderCustomer(name: string, mobile: string, paymentTerms = "due_on_receipt"): Customer {
  return { id: "", name, mobile, email: "", dob: "", anniversary: "", address: "", measurements: {}, notes: "", createdAt: "", loyaltyPoints: 0, totalEarned: 0, loyaltyHistory: [], paymentTerms, priceListId: null, tags: [], gstin: "" };
}

function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 border-b pb-2 mb-4">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
        <Icon className="size-3.5 text-primary" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function FieldGroup({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function InvoiceForm({ prefillQuoteId, prefillCloneId, existing }: { prefillQuoteId?: string; prefillCloneId?: string; existing?: SalesInvoice }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: products } = useProducts();
  const { data: prefillQuote } = useSalesQuotation(prefillQuoteId || "");
  const { data: prefillClone } = useSalesInvoice(prefillCloneId || "");
  const { data: defaultTerms } = useAppSetting<string>("invoiceTerms", DEFAULT_INVOICE_TERMS);
  const { data: numbering } = useAppSetting<DocumentNumberingSettings>("documentNumbering", DEFAULT_DOCUMENT_NUMBERING);
  const saveInvoice = useSaveInvoice();
  const isEdit = !!existing;

  // Sequential numbering (Settings > Document Numbering) is assigned server-side, atomically, at
  // save time -- this client-generated value is only ever a placeholder for the (required,
  // non-empty) form payload when it's disabled, or a fallback if settings haven't loaded yet.
  // It's deliberately never shown to the user as if it were real once custom numbering is on.
  const [invoiceNumber] = useState(existing?.invoiceNumber || genInvoiceNumber());
  const customNumberingOn = !isEdit && numbering?.invoice.enabled;
  const [customer, setCustomer] = useState<Customer | null>(existing ? placeholderCustomer(existing.customerName, existing.customerMobile) : null);
  const priceOverrides = usePriceListItemsMap(customer?.priceListId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subject, setSubject] = useState(existing?.subject || "");
  const [invoiceDate, setInvoiceDate] = useState(existing?.invoiceDate || new Date().toISOString().slice(0, 10));
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>("due_on_receipt");
  const [dueDate, setDueDate] = useState(existing?.dueDate || "");
  const [lines, setLines] = useState<EditableSalesLine[]>(
    existing
      ? existing.items.map((item, i) => ({ key: `existing-${i}`, productId: item.productId, qty: String(item.qty), unitPrice: String(item.unitPrice), discountPercent: String(item.discountPercent || 0) }))
      : [blankSalesLine()]
  );
  const [gstType, setGstType] = useState<GstType>(existing?.gstType || "none");
  const [taxRate, setTaxRate] = useState(String(existing?.taxRate ?? 5));
  const [shippingCharges, setShippingCharges] = useState(blankIfZero(existing?.shippingCharges));
  const [discountType, setDiscountType] = useState<DiscountType>(existing?.discountType || "flat");
  const [discountValue, setDiscountValue] = useState(blankIfZero(existing?.discountValue));
  const [terms, setTerms] = useState(existing?.terms ?? "");
  const [notes, setNotes] = useState(existing?.notes || "");

  useEffect(() => {
    if (!isEdit && defaultTerms && !terms) setTerms(defaultTerms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTerms]);

  useEffect(() => {
    if (!prefillQuote) return;
    setCustomer(placeholderCustomer(prefillQuote.customerName, prefillQuote.customerMobile));
    setLines(
      prefillQuote.items.map((item) => ({
        key: `quo-${item.productId}-${Math.random().toString(36).slice(2, 7)}`,
        productId: item.productId,
        qty: String(item.qty),
        unitPrice: String(item.unitPrice),
        discountPercent: blankIfZero(item.discountPercent),
      }))
    );
    setGstType(prefillQuote.gstType);
    setTaxRate(String(prefillQuote.taxRate));
  }, [prefillQuote]);

  useEffect(() => {
    if (!prefillClone) return;
    setCustomer(placeholderCustomer(prefillClone.customerName, prefillClone.customerMobile));
    setSubject(prefillClone.subject);
    setLines(
      prefillClone.items.map((item, i) => ({
        key: `clone-${i}-${Math.random().toString(36).slice(2, 7)}`,
        productId: item.productId,
        qty: String(item.qty),
        unitPrice: String(item.unitPrice),
        discountPercent: blankIfZero(item.discountPercent),
      }))
    );
    setGstType(prefillClone.gstType);
    setTaxRate(String(prefillClone.taxRate));
    setShippingCharges(blankIfZero(prefillClone.shippingCharges));
    setDiscountType(prefillClone.discountType);
    setDiscountValue(blankIfZero(prefillClone.discountValue));
    setTerms(prefillClone.terms);
    setNotes(prefillClone.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillClone]);

  function handleSelectCustomer(c: Customer) {
    setCustomer(c);
    if (!isEdit && c.paymentTerms) {
      const term = (PAYMENT_TERMS.includes(c.paymentTerms as PaymentTerm) ? c.paymentTerms : "due_on_receipt") as PaymentTerm;
      setPaymentTerm(term);
      setDueDate(dueDateFromTerm(invoiceDate, term));
    }
  }

  function handleTermChange(term: PaymentTerm) {
    setPaymentTerm(term);
    setDueDate(dueDateFromTerm(invoiceDate, term));
  }

  function handleInvoiceDateChange(date: string) {
    setInvoiceDate(date);
    setDueDate(dueDateFromTerm(date, paymentTerm));
  }

  const productsById = useMemo(() => new Map((products || []).map((p) => [p.id, { name: p.name }])), [products]);
  const items = salesLinesToItems(lines, productsById);
  const totals = computeInvoiceTotals(items, parseFloat(shippingCharges) || 0, discountType, parseFloat(discountValue) || 0, parseFloat(taxRate) || 0, gstType);

  async function handleSave(docStatus: InvoiceDocStatus) {
    if (!customer) return toast.error("Select a customer first");
    if (items.length === 0) return toast.error("Add at least one item");

    try {
      const res = await saveInvoice.mutateAsync({
        id: existing?.id,
        invoiceNumber,
        customerMobile: customer.mobile,
        customerName: customer.name,
        quoteId: existing?.quoteId ?? (prefillQuoteId || null),
        invoiceDate,
        dueDate: dueDate || null,
        items,
        subject,
        shippingCharges: parseFloat(shippingCharges) || 0,
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        gstType,
        taxRate: parseFloat(taxRate) || 0,
        docStatus,
        terms,
        notes,
        userEmail: user?.email,
      });
      const finalNumber = res.invoice_number || invoiceNumber;
      toast.success(
        isEdit ? `Invoice ${finalNumber} updated` : `Invoice ${finalNumber} ${docStatus === "draft" ? "saved as draft" : "created"}`
      );
      router.push(`/sales/invoices/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save invoice");
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* ── Page header bar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/sales/invoices" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Invoices</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Invoice" : "New Invoice"}</h1>
            <p className="text-[11px] text-muted-foreground font-mono">{customNumberingOn ? "Assigned automatically on save" : invoiceNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()} disabled={saveInvoice.isPending}>
              Cancel
            </Button>
            {!isEdit && (
              <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saveInvoice.isPending}>
                {saveInvoice.isPending ? "Saving…" : "Save Draft"}
              </Button>
            )}
            <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={() => handleSave(isEdit ? existing!.docStatus : "sent")} disabled={saveInvoice.isPending}>
              <Receipt className="size-3.5" />
              {saveInvoice.isPending ? "Saving…" : isEdit ? `Save Changes · ${inr(totals.total)}` : `Save & Send · ${inr(totals.total)}`}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        {/* ── Main form ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Customer & Invoice Info */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={User2} label="Customer & Invoice Info" />

            {/* Customer — full width, prominent */}
            <div className="mb-4">
              <FieldGroup label="Customer" required>
                <CustomerPickerTrigger
                  customerName={customer?.name || ""}
                  onClick={() => setPickerOpen(true)}
                />
              </FieldGroup>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Invoice date" required>
                <DatePicker value={invoiceDate} onChange={handleInvoiceDateChange} />
              </FieldGroup>
              <FieldGroup label="Payment terms">
                <Select value={paymentTerm} onValueChange={(v) => v && handleTermChange(v as PaymentTerm)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue>{paymentTermLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map((t) => (
                      <SelectItem key={t} value={t}>{PAYMENT_TERM_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
              <FieldGroup label="Due date">
                <DatePicker value={dueDate} onChange={setDueDate} />
              </FieldGroup>
              <FieldGroup label="Subject">
                <Input placeholder="What this invoice is for…" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10" />
              </FieldGroup>
            </div>
          </div>

          {/* Line Items */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Package2} label="Items" />
            <ProductLineItemsEditor lines={lines} onChange={setLines} showDiscount priceOverrides={priceOverrides} />
          </div>

          {/* Tax, Shipping & Discount */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Tag} label="Tax, Shipping & Discount" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="GST type">
                <Select value={gstType} onValueChange={(v) => v && setGstType(v as GstType)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue>{gstTypeLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No GST</SelectItem>
                    <SelectItem value="intra">Intra-state (CGST + SGST)</SelectItem>
                    <SelectItem value="inter">Inter-state (IGST)</SelectItem>
                  </SelectContent>
                </Select>
              </FieldGroup>
              <FieldGroup label="Tax rate (%)">
                <Input type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} disabled={gstType === "none"} className="h-10" />
              </FieldGroup>
              <FieldGroup label="Shipping charges (₹)">
                <Input type="number" min={0} step="0.01" placeholder="0" value={shippingCharges} onChange={(e) => setShippingCharges(e.target.value)} className="h-10" />
              </FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Discount type">
                  <Select value={discountType} onValueChange={(v) => v && setDiscountType(v as DiscountType)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue>{discountType === "percent" ? "Percent (%)" : "Flat (₹)"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat (₹)</SelectItem>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Discount value">
                  <Input type="number" min={0} step="0.01" placeholder="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="h-10" />
                </FieldGroup>
              </div>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={FileText} label="Notes & Terms" />
            <div className="space-y-4">
              <FieldGroup label="Customer notes" hint="Internal — not printed on the invoice">
                <Textarea rows={2} placeholder="Order ref, special instructions…" value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" />
              </FieldGroup>
              <FieldGroup label="Terms & Conditions" hint="Printed on the invoice. Edit the shop-wide default in Settings → Invoice Terms.">
                <Textarea rows={3} placeholder="Payment terms, return policy…" value={terms} onChange={(e) => setTerms(e.target.value)} className="resize-none" />
              </FieldGroup>
            </div>
          </div>
        </div>

        {/* ── Summary sidebar ────────────────────────────────────────────── */}
        <div className="mt-5 lg:mt-0 lg:sticky lg:top-[61px] space-y-4">
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            {/* Coloured top strip */}
            <div className="bg-primary px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">Invoice summary</p>
              <p className="text-2xl font-bold text-primary-foreground tabular-nums">{inr(totals.total)}</p>
            </div>

            <div className="px-5 py-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Line subtotal</span>
                <span className="tabular-nums">{inr(totals.lineSubtotal)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Discount</span>
                  <span className="tabular-nums">−{inr(totals.discountAmount)}</span>
                </div>
              )}
              {totals.shippingCharges > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping</span>
                  <span className="tabular-nums">{inr(totals.shippingCharges)}</span>
                </div>
              )}
              {gstType !== "none" && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxable amount</span>
                  <span className="tabular-nums">{inr(totals.taxableAmount)}</span>
                </div>
              )}
              {gstType === "intra" && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>CGST</span>
                    <span className="tabular-nums">{inr(totals.cgst)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>SGST</span>
                    <span className="tabular-nums">{inr(totals.sgst)}</span>
                  </div>
                </>
              )}
              {gstType === "inter" && (
                <div className="flex justify-between text-muted-foreground">
                  <span>IGST</span>
                  <span className="tabular-nums">{inr(totals.igst)}</span>
                </div>
              )}
              {totals.roundOff !== 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Round off</span>
                  <span className="tabular-nums">{totals.roundOff > 0 ? "+" : ""}{inr(totals.roundOff)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold text-base">
                <span>Total</span>
                <span className="tabular-nums">{inr(totals.total)}</span>
              </div>
            </div>

            {isEdit && (
              <p className="px-5 pb-4 text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                Editing adjusts the stock movement this invoice made. Changes to items will recompute finished-goods inventory.
              </p>
            )}

            <div className="border-t px-5 py-4 space-y-2">
              {isEdit ? (
                <Button className="w-full h-10 gap-2" onClick={() => handleSave(existing!.docStatus)} disabled={saveInvoice.isPending}>
                  <Receipt className="size-4" />
                  {saveInvoice.isPending ? "Saving…" : `Save Changes · ${inr(totals.total)}`}
                </Button>
              ) : (
                <>
                  <Button className="w-full h-10 gap-2" onClick={() => handleSave("sent")} disabled={saveInvoice.isPending}>
                    <Receipt className="size-4" />
                    {saveInvoice.isPending ? "Saving…" : `Save & Send · ${inr(totals.total)}`}
                  </Button>
                  <Button variant="outline" className="w-full h-10" onClick={() => handleSave("draft")} disabled={saveInvoice.isPending}>
                    {saveInvoice.isPending ? "Saving…" : "Save as Draft"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Quick checklist */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm px-5 py-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Checklist</p>
            {[
              { label: "Customer selected", done: !!customer },
              { label: "At least one item", done: items.length > 0 },
              { label: "Invoice date set", done: !!invoiceDate },
              { label: "Total > ₹0", done: totals.total > 0 },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <div className={cn("size-4 rounded-full flex items-center justify-center text-[10px] font-bold", done ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                  {done ? "✓" : "·"}
                </div>
                <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CustomerPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={handleSelectCustomer} />
    </div>
  );
}
