"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useProducts } from "@/hooks/use-products";
import { useSalesQuotation } from "@/hooks/use-sales-quotations";
import { useSalesInvoice } from "@/hooks/use-sales-invoices";
import { useSaveInvoice } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAppSetting } from "@/hooks/use-app-setting";
import { genInvoiceNumber } from "@/lib/sales";
import { computeGst, GST_TYPE_LABELS, type GstType } from "@/lib/gst";
import { computeInvoiceTotals, type DiscountType } from "@/lib/invoice-totals";
import { PAYMENT_TERMS, PAYMENT_TERM_LABELS, dueDateFromTerm, type PaymentTerm } from "@/lib/payment-terms";
import { DEFAULT_INVOICE_TERMS } from "@/lib/invoice-settings";
import { inr } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerPicker, CustomerPickerTrigger } from "@/components/sales/customer-picker";
import { ProductLineItemsEditor, salesLinesToItems, blankSalesLine, type EditableSalesLine } from "@/components/sales/product-line-items-editor";
import { usePriceListItemsMap } from "@/hooks/use-price-lists";
import type { Customer, SalesInvoice, InvoiceDocStatus } from "@/lib/types";

const gstTypeLabel = (v: unknown) => GST_TYPE_LABELS[v as GstType] ?? "";
const paymentTermLabel = (v: unknown) => PAYMENT_TERM_LABELS[v as PaymentTerm] ?? "";
const discountTypeLabel = (v: unknown) => (v === "percent" ? "Percent (%)" : "Flat (₹)");

function placeholderCustomer(name: string, mobile: string, paymentTerms = "due_on_receipt"): Customer {
  return { id: "", name, mobile, email: "", dob: "", anniversary: "", address: "", measurements: {}, notes: "", createdAt: "", loyaltyPoints: 0, totalEarned: 0, loyaltyHistory: [], paymentTerms, priceListId: null, tags: [], gstin: "" };
}

export function InvoiceForm({ prefillQuoteId, prefillCloneId, existing }: { prefillQuoteId?: string; prefillCloneId?: string; existing?: SalesInvoice }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: products } = useProducts();
  const { data: prefillQuote } = useSalesQuotation(prefillQuoteId || "");
  const { data: prefillClone } = useSalesInvoice(prefillCloneId || "");
  const { data: defaultTerms } = useAppSetting<string>("invoiceTerms", DEFAULT_INVOICE_TERMS);
  const saveInvoice = useSaveInvoice();
  const isEdit = !!existing;

  const [invoiceNumber] = useState(existing?.invoiceNumber || genInvoiceNumber());
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
  const [shippingCharges, setShippingCharges] = useState(String(existing?.shippingCharges ?? 0));
  const [discountType, setDiscountType] = useState<DiscountType>(existing?.discountType || "flat");
  const [discountValue, setDiscountValue] = useState(String(existing?.discountValue ?? 0));
  const [terms, setTerms] = useState(existing?.terms ?? "");
  const [notes, setNotes] = useState(existing?.notes || "");

  // Prefill terms from the shop's default once it loads — but only for a brand-new invoice,
  // and only if the user hasn't already typed something in.
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
        discountPercent: String(item.discountPercent || 0),
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
        discountPercent: String(item.discountPercent || 0),
      }))
    );
    setGstType(prefillClone.gstType);
    setTaxRate(String(prefillClone.taxRate));
    setShippingCharges(String(prefillClone.shippingCharges));
    setDiscountType(prefillClone.discountType);
    setDiscountValue(String(prefillClone.discountValue));
    setTerms(prefillClone.terms);
    setNotes(prefillClone.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillClone]);

  function handleSelectCustomer(c: Customer) {
    setCustomer(c);
    // Prefill the due date from the customer's default payment terms — still editable after.
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
    if (!customer) return toast.error("Select a customer");
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
      toast.success(
        isEdit ? `Invoice ${invoiceNumber} updated — stock adjusted` : `Invoice ${invoiceNumber} ${docStatus === "draft" ? "saved as draft" : "created"} — stock updated`
      );
      router.push(`/sales/invoices/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save invoice");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">{isEdit ? `Edit invoice · ${invoiceNumber}` : `New invoice · ${invoiceNumber}`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Customer *</Label>
              <CustomerPickerTrigger customerName={customer?.name || ""} onClick={() => setPickerOpen(true)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Invoice date</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => handleInvoiceDateChange(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Subject</Label>
            <Input placeholder="Let your customer know what this invoice is for" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Payment terms</Label>
              <Select value={paymentTerm} onValueChange={(v) => v && handleTermChange(v as PaymentTerm)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{paymentTermLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PAYMENT_TERM_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Items</Label>
            <ProductLineItemsEditor lines={lines} onChange={setLines} showDiscount priceOverrides={priceOverrides} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">GST type</Label>
              <Select value={gstType} onValueChange={(v) => v && setGstType(v as GstType)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{gstTypeLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No GST</SelectItem>
                  <SelectItem value="intra">Intra-state (CGST + SGST)</SelectItem>
                  <SelectItem value="inter">Inter-state (IGST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tax rate (%)</Label>
              <Input type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} disabled={gstType === "none"} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Shipping charges (₹)</Label>
              <Input type="number" min={0} step="0.01" value={shippingCharges} onChange={(e) => setShippingCharges(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Discount type</Label>
              <Select value={discountType} onValueChange={(v) => v && setDiscountType(v as DiscountType)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{discountTypeLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat (₹)</SelectItem>
                  <SelectItem value="percent">Percent (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Discount value</Label>
              <Input type="number" min={0} step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Terms & Conditions</Label>
            <Textarea rows={3} placeholder="Payment terms, return policy, jurisdiction…" value={terms} onChange={(e) => setTerms(e.target.value)} />
            <p className="text-xs text-muted-foreground">Shown on the printed/PDF invoice. Edit the shop-wide default in Settings → Invoice Terms.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Customer notes</Label>
            <Textarea rows={2} placeholder="Internal notes — not shown on the invoice…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Line subtotal</span>
                <span className="tabular-nums">{inr(totals.lineSubtotal)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span className="tabular-nums">-{inr(totals.discountAmount)}</span>
                </div>
              )}
              {totals.shippingCharges > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping charges</span>
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
                  <span className="tabular-nums">
                    {totals.roundOff > 0 ? "+" : ""}
                    {inr(totals.roundOff)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{inr(totals.total)}</span>
              </div>
            </div>

            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Editing replaces the stock movement this invoice made — finished-goods stock will recompute to match the updated items.
              </p>
            )}

            <div className="space-y-1.5 border-t pt-4">
              {isEdit ? (
                <Button className="w-full" onClick={() => handleSave(existing!.docStatus)} disabled={saveInvoice.isPending}>
                  {saveInvoice.isPending ? "Saving…" : `Save changes · ${inr(totals.total)}`}
                </Button>
              ) : (
                <>
                  <Button className="w-full" onClick={() => handleSave("sent")} disabled={saveInvoice.isPending}>
                    {saveInvoice.isPending ? "Saving…" : `Save & Mark Sent · ${inr(totals.total)}`}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => handleSave("draft")} disabled={saveInvoice.isPending}>
                    {saveInvoice.isPending ? "Saving…" : "Save as Draft"}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <CustomerPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={handleSelectCustomer} />
    </div>
  );
}
