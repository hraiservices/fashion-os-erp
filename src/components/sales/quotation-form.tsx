"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useProducts } from "@/hooks/use-products";
import { useSaveQuotation } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { genQuoteNumber } from "@/lib/sales";
import { computeGst, GST_TYPE_LABELS, type GstType } from "@/lib/gst";
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
import type { Customer, SalesQuotation } from "@/lib/types";

const gstTypeLabel = (v: unknown) => GST_TYPE_LABELS[v as GstType] ?? "";

function placeholderCustomer(name: string, mobile: string): Customer {
  return { id: "", name, mobile, email: "", dob: "", anniversary: "", address: "", measurements: {}, notes: "", createdAt: "", loyaltyPoints: 0, totalEarned: 0, loyaltyHistory: [], paymentTerms: "due_on_receipt", priceListId: null };
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
      ? existing.items.map((item, i) => ({ key: `existing-${i}`, productId: item.productId, qty: String(item.qty), unitPrice: String(item.unitPrice), discountPercent: String(item.discountPercent || 0) }))
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
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">{isEdit ? `Edit quotation · ${quoteNumber}` : `New quotation · ${quoteNumber}`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Customer *</Label>
              <CustomerPickerTrigger customerName={customer?.name || ""} onClick={() => setPickerOpen(true)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Valid until</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Items</Label>
            <ProductLineItemsEditor lines={lines} onChange={setLines} priceOverrides={priceOverrides} />
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

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea rows={2} placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
                <span>Taxable amount</span>
                <span className="tabular-nums">{inr(gstPreview.taxableAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{inr(gstPreview.total)}</span>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saveQuotation.isPending}>
              {saveQuotation.isPending ? "Saving…" : isEdit ? `Save changes · ${inr(gstPreview.total)}` : `Create quotation · ${inr(gstPreview.total)}`}
            </Button>
          </CardContent>
        </Card>
      </div>

      <CustomerPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={setCustomer} />
    </div>
  );
}
