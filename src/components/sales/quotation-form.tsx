"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, User2, Package2, Tag, FileText, FileCheck } from "lucide-react";
import Link from "next/link";
import { useProducts } from "@/hooks/use-products";
import { useSaveQuotation } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { genQuoteNumber } from "@/lib/sales";
import { computeGst, GST_TYPE_LABELS, type GstType } from "@/lib/gst";
import { inr } from "@/lib/format";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CustomerPicker, CustomerPickerTrigger } from "@/components/sales/customer-picker";
import { ProductLineItemsEditor, salesLinesToItems, blankSalesLine, type EditableSalesLine } from "@/components/sales/product-line-items-editor";
import { usePriceListItemsMap } from "@/hooks/use-price-lists";
import type { Customer, SalesQuotation } from "@/lib/types";

const gstTypeLabel = (v: unknown) => GST_TYPE_LABELS[v as GstType] ?? "";

function placeholderCustomer(name: string, mobile: string): Customer {
  return { id: "", name, mobile, email: "", dob: "", anniversary: "", address: "", measurements: {}, notes: "", createdAt: "", loyaltyPoints: 0, totalEarned: 0, loyaltyHistory: [], paymentTerms: "due_on_receipt", priceListId: null, tags: [], gstin: "" };
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
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function QuotationForm({ existing }: { existing?: SalesQuotation }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: products } = useProducts();
  const saveQuotation = useSaveQuotation();
  const isEdit = !!existing;

  const [quoteNumber] = useState(existing?.quoteNumber || genQuoteNumber());
  const [customer, setCustomer] = useState<Customer | null>(existing ? placeholderCustomer(existing.customerName, existing.customerMobile) : null);
  const priceOverrides = usePriceListItemsMap(customer?.priceListId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [date, setDate] = useState(existing?.date || new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(existing?.validUntil || "");
  const [lines, setLines] = useState<EditableSalesLine[]>(
    existing
      ? existing.items.map((item, i) => ({
          key: `existing-${i}`,
          productId: item.productId,
          qty: String(item.qty),
          unitPrice: String(item.unitPrice),
          discountType: item.discountType || "percent",
          discountPercent: String(item.discountPercent || 0),
          discountFlat: String(item.discountFlat || 0),
          costPrice: String(item.costPrice || 0),
        }))
      : [blankSalesLine()]
  );
  const [gstType, setGstType] = useState<GstType>(existing?.gstType || "none");
  const [taxRate, setTaxRate] = useState(String(existing?.taxRate ?? 5));
  const [notes, setNotes] = useState(existing?.notes || "");

  const productsById = useMemo(() => new Map((products || []).map((p) => [p.id, { name: p.name }])), [products]);
  const items = salesLinesToItems(lines, productsById);
  const taxableAmount = items.reduce((s, i) => s + i.amount, 0);
  const gstPreview = computeGst(taxableAmount, parseFloat(taxRate) || 0, gstType);

  async function handleSave() {
    if (!customer) return toast.error("Select a customer");
    if (items.length === 0) return toast.error("Add at least one item");

    try {
      const res = await saveQuotation.mutateAsync({
        id: existing?.id,
        quoteNumber,
        customerMobile: customer.mobile,
        customerName: customer.name,
        date,
        validUntil: validUntil || null,
        status: existing?.status || "draft",
        items,
        gstType,
        taxRate: parseFloat(taxRate) || 0,
        notes,
        userEmail: user?.email,
      });
      toast.success(isEdit ? `Quotation ${quoteNumber} updated` : `Quotation ${quoteNumber} created`);
      router.push(`/sales/quotations/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save quotation");
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/sales/quotations" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Quotations</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Quotation" : "New Quotation"}</h1>
            <p className="text-[11px] text-muted-foreground font-mono">{quoteNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()} disabled={saveQuotation.isPending}>Cancel</Button>
            <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={handleSave} disabled={saveQuotation.isPending}>
              <FileCheck className="size-3.5" />
              {saveQuotation.isPending ? "Saving…" : isEdit ? `Save Changes · ${inr(gstPreview.total)}` : `Create Quotation · ${inr(gstPreview.total)}`}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Customer & dates */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={User2} label="Customer & dates" />
            <div className="mb-4">
              <FieldGroup label="Customer" required>
                <CustomerPickerTrigger customerName={customer?.name || ""} onClick={() => setPickerOpen(true)} />
              </FieldGroup>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Quote date" required>
                <DatePicker value={date} onChange={setDate} />
              </FieldGroup>
              <FieldGroup label="Valid until">
                <DatePicker value={validUntil} onChange={setValidUntil} />
              </FieldGroup>
            </div>
          </div>

          {/* Items */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Package2} label="Items" />
            <ProductLineItemsEditor lines={lines} onChange={setLines} priceOverrides={priceOverrides} />
          </div>

          {/* Tax */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Tag} label="Tax" />
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
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={FileText} label="Notes" />
            <FieldGroup label="Notes to customer">
              <Textarea rows={3} placeholder="Special conditions, payment terms, delivery details…" value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" />
            </FieldGroup>
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="mt-5 lg:mt-0 lg:sticky lg:top-[61px] space-y-4">
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="bg-primary px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">Quotation summary</p>
              <p className="text-2xl font-bold text-primary-foreground tabular-nums">{inr(gstPreview.total)}</p>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Taxable amount</span>
                <span className="tabular-nums">{inr(gstPreview.taxableAmount)}</span>
              </div>
              {gstType === "intra" && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>CGST</span><span className="tabular-nums">{inr(gstPreview.cgst)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>SGST</span><span className="tabular-nums">{inr(gstPreview.sgst)}</span>
                  </div>
                </>
              )}
              {gstType === "inter" && (
                <div className="flex justify-between text-muted-foreground">
                  <span>IGST</span><span className="tabular-nums">{inr(gstPreview.igst)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold text-base">
                <span>Total</span><span className="tabular-nums">{inr(gstPreview.total)}</span>
              </div>
            </div>
            <div className="border-t px-5 py-4">
              <Button className="w-full h-10 gap-2" onClick={handleSave} disabled={saveQuotation.isPending}>
                <FileCheck className="size-4" />
                {saveQuotation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Quotation"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <CustomerPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setCustomer} />
    </div>
  );
}
