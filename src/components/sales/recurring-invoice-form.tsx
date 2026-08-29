"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useProducts } from "@/hooks/use-products";
import { useSaveRecurringInvoiceProfile } from "@/hooks/use-recurring-invoices";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAppSetting } from "@/hooks/use-app-setting";
import { usePriceListItemsMap } from "@/hooks/use-price-lists";
import { GST_TYPE_LABELS, type GstType } from "@/lib/gst";
import { computeInvoiceTotals, type DiscountType } from "@/lib/invoice-totals";
import { DEFAULT_INVOICE_TERMS } from "@/lib/invoice-settings";
import { RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABELS, RECURRING_END_TYPES, RECURRING_END_TYPE_LABELS } from "@/lib/recurring-invoices";
import { inr } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerPicker, CustomerPickerTrigger } from "@/components/sales/customer-picker";
import { ProductLineItemsEditor, salesLinesToItems, blankSalesLine, type EditableSalesLine } from "@/components/sales/product-line-items-editor";
import type { Customer, RecurringInvoiceProfile, RecurringFrequency, RecurringEndType } from "@/lib/types";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

const gstTypeLabel = (v: unknown) => GST_TYPE_LABELS[v as GstType] ?? "";
const discountTypeLabel = (v: unknown) => (v === "percent" ? "Percent (%)" : "Flat (₹)");
const frequencyLabel = (v: unknown) => RECURRING_FREQUENCY_LABELS[v as RecurringFrequency] ?? "";
const endTypeLabel = (v: unknown) => RECURRING_END_TYPE_LABELS[v as RecurringEndType] ?? "";

function placeholderCustomer(name: string, mobile: string): Customer {
  return { id: "", name, mobile, email: "", dob: "", anniversary: "", address: "", measurements: {}, notes: "", createdAt: "", loyaltyPoints: 0, totalEarned: 0, loyaltyHistory: [], paymentTerms: "due_on_receipt", priceListId: null, tags: [], gstin: "", whatsappOptOut: false };
}

/** Renders blank (with the input's own "0" placeholder) instead of a literal typed "0" for fields where zero and "not entered" should look the same. */
function blankIfZero(n: number | null | undefined): string {
  return n ? String(n) : "";
}

export function RecurringInvoiceForm({ existing }: { existing?: RecurringInvoiceProfile }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: products } = useProducts();
  const { data: defaultTerms } = useAppSetting<string>("invoiceTerms", DEFAULT_INVOICE_TERMS);
  const saveProfile = useSaveRecurringInvoiceProfile();
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name || "");
  const [customer, setCustomer] = useState<Customer | null>(existing ? placeholderCustomer(existing.customerName, existing.customerMobile) : null);
  const priceOverrides = usePriceListItemsMap(customer?.priceListId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subject, setSubject] = useState(existing?.subject || "");
  const [lines, setLines] = useState<EditableSalesLine[]>(
    existing
      ? existing.items.map((item, i) => ({ key: `existing-${i}`, productId: item.productId, qty: String(item.qty), unitPrice: String(item.unitPrice), discountPercent: blankIfZero(item.discountPercent) }))
      : [blankSalesLine()]
  );
  const [gstType, setGstType] = useState<GstType>(existing?.gstType || "none");
  const [taxRate, setTaxRate] = useState(String(existing?.taxRate ?? 5));
  const [shippingCharges, setShippingCharges] = useState(blankIfZero(existing?.shippingCharges));
  const [discountType, setDiscountType] = useState<DiscountType>(existing?.discountType || "flat");
  const [discountValue, setDiscountValue] = useState(blankIfZero(existing?.discountValue));
  const [terms, setTerms] = useState(existing?.terms ?? defaultTerms ?? "");
  const [notes, setNotes] = useState(existing?.notes || "");

  const [frequency, setFrequency] = useState<RecurringFrequency>(existing?.frequency || "monthly");
  const [nextRunDate, setNextRunDate] = useState(existing?.nextRunDate || new Date().toISOString().slice(0, 10));
  const [endType, setEndType] = useState<RecurringEndType>(existing?.endType || "never");
  const [endDate, setEndDate] = useState(existing?.endDate || "");
  const [endAfterCount, setEndAfterCount] = useState(String(existing?.endAfterCount ?? 12));

  const productsById = useMemo(() => new Map((products || []).map((p) => [p.id, { name: p.name }])), [products]);
  const items = salesLinesToItems(lines, productsById);
  const totals = computeInvoiceTotals(items, parseFloat(shippingCharges) || 0, discountType, parseFloat(discountValue) || 0, parseFloat(taxRate) || 0, gstType);

  async function handleSave() {
    if (!name.trim()) return toast.error("Give this profile a name");
    if (!customer) return toast.error("Select a customer");
    if (items.length === 0) return toast.error("Add at least one item");

    try {
      await saveProfile.mutateAsync({
        id: existing?.id,
        name: name.trim(),
        customerMobile: customer.mobile,
        customerName: customer.name,
        items,
        subject,
        shippingCharges: parseFloat(shippingCharges) || 0,
        discountType,
        discountValue: parseFloat(discountValue) || 0,
        gstType,
        taxRate: parseFloat(taxRate) || 0,
        terms,
        notes,
        frequency,
        nextRunDate,
        endType,
        endDate: endType === "on_date" ? endDate || null : null,
        endAfterCount: endType === "after_count" ? parseInt(endAfterCount, 10) || 0 : null,
        userEmail: user?.email,
      });
      toast.success(isEdit ? "Recurring invoice profile updated" : "Recurring invoice profile created");
      router.push("/sales/recurring-invoices");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save profile");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">{isEdit ? "Edit recurring invoice profile" : "New recurring invoice profile"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Profile name *</Label>
              <Input placeholder="e.g. Monthly maintenance retainer" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Customer *</Label>
              <CustomerPickerTrigger customerName={customer?.name || ""} onClick={() => setPickerOpen(true)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Subject</Label>
            <Input placeholder="Shown on each generated invoice" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Frequency</Label>
              <Select value={frequency} onValueChange={(v) => v && setFrequency(v as RecurringFrequency)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue>{frequencyLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECURRING_FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {RECURRING_FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Next run date</Label>
              <DatePicker value={nextRunDate} onChange={setNextRunDate} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Ends</Label>
              <Select value={endType} onValueChange={(v) => v && setEndType(v as RecurringEndType)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue>{endTypeLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECURRING_END_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RECURRING_END_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {endType === "on_date" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">End date</Label>
              <DatePicker value={endDate} onChange={setEndDate} />
            </div>
          )}
          {endType === "after_count" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Number of invoices to generate</Label>
              <Input type="number" inputMode="numeric" min={1} value={endAfterCount} onChange={(e) => setEndAfterCount(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Items</Label>
            <ProductLineItemsEditor lines={lines} onChange={setLines} showDiscount priceOverrides={priceOverrides} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">GST type</Label>
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
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tax rate (%)</Label>
              <Input type="number" inputMode="decimal" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} disabled={gstType === "none"} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Shipping charges (₹)</Label>
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={shippingCharges} onChange={(e) => setShippingCharges(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Discount type</Label>
              <Select value={discountType} onValueChange={(v) => v && setDiscountType(v as DiscountType)}>
                <SelectTrigger className="h-10 w-full">
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
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            </div>
          </div>

          <Accordion className="rounded-lg border px-3">
            <AccordionItem value="terms" className="border-b-0">
              <AccordionTrigger className="text-xs font-medium">Terms &amp; Conditions</AccordionTrigger>
              <AccordionContent>
                <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-base font-semibold">
              <span>Total per invoice</span>
              <span className="tabular-nums">{inr(totals.total)}</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Each generated invoice lands as a normal Draft — nothing is auto-sent, and stock deducts the same way as a manually created invoice.
            </p>

            <Button className="w-full" onClick={handleSave} disabled={saveProfile.isPending}>
              {saveProfile.isPending ? "Saving…" : isEdit ? "Save changes" : "Create profile"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <CustomerPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setCustomer} />
    </div>
  );
}
