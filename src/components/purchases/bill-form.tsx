"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseOrder } from "@/hooks/use-purchase-orders";
import { useSaveBill } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { genBillNumber } from "@/lib/purchases";
import { computeGst, GST_TYPE_LABELS, type GstType } from "@/lib/gst";
import { PAYMENT_TERMS, PAYMENT_TERM_LABELS, dueDateFromTerm, type PaymentTerm } from "@/lib/payment-terms";
import { inr } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineItemsEditor, linesToItems, blankLine, lineFromItem, type EditableLine } from "@/components/purchases/line-items-editor";
import type { PurchaseBill } from "@/lib/types";

const gstTypeLabel = (v: unknown) => GST_TYPE_LABELS[v as GstType] ?? "";
const paymentTermLabel = (v: unknown) => PAYMENT_TERM_LABELS[v as PaymentTerm] ?? "";

export function BillForm({ prefillPoId, existing }: { prefillPoId?: string; existing?: PurchaseBill }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: vendors } = useVendors();
  const { data: prefillPo } = usePurchaseOrder(prefillPoId || "");
  const saveBill = useSaveBill();
  const isEdit = !!existing;

  const [billNumber] = useState(existing?.billNumber || genBillNumber());
  const [vendorId, setVendorId] = useState(existing?.vendorId || "");
  const [billDate, setBillDate] = useState(existing?.billDate || new Date().toISOString().slice(0, 10));
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>("due_on_receipt");
  const [dueDate, setDueDate] = useState(existing?.dueDate || "");
  const [lines, setLines] = useState<EditableLine[]>(
    existing ? existing.items.map((item, i) => lineFromItem(item, `existing-${i}`)) : [blankLine()]
  );
  const [gstType, setGstType] = useState<GstType>(existing?.gstType || "none");
  const [taxRate, setTaxRate] = useState(String(existing?.taxRate ?? 5));
  const [notes, setNotes] = useState(existing?.notes || "");

  useEffect(() => {
    if (!prefillPo) return;
    setVendorId(prefillPo.vendorId);
    setLines(prefillPo.items.map((item, i) => lineFromItem(item, `po-${i}`)));
  }, [prefillPo]);

  function handleTermChange(term: PaymentTerm) {
    setPaymentTerm(term);
    setDueDate(dueDateFromTerm(billDate, term));
  }

  function handleBillDateChange(date: string) {
    setBillDate(date);
    setDueDate(dueDateFromTerm(date, paymentTerm));
  }

  const vendorLabel = (id: string) => (vendors || []).find((v) => v.id === id)?.name ?? "";

  const items = linesToItems(lines);
  const taxableAmount = items.reduce((s, i) => s + i.amount, 0);
  const gstPreview = computeGst(taxableAmount, parseFloat(taxRate) || 0, gstType);

  async function handleSave() {
    if (!vendorId) return toast.error("Select a vendor");
    if (items.length === 0) return toast.error("Add at least one item");

    try {
      const res = await saveBill.mutateAsync({
        id: existing?.id,
        billNumber,
        vendorId,
        poId: existing?.poId ?? (prefillPoId || null),
        billDate,
        dueDate: dueDate || null,
        items,
        gstType,
        taxRate: parseFloat(taxRate) || 0,
        notes,
        userEmail: user?.email,
      });
      toast.success(isEdit ? `Bill ${billNumber} updated — stock adjusted` : `Bill ${billNumber} recorded — stock updated`);
      router.push(`/purchases/bills/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save bill");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">{isEdit ? `Edit bill · ${billNumber}` : `New bill · ${billNumber}`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Vendor *</Label>
              <Select value={vendorId} onValueChange={(v) => v && setVendorId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select vendor…">{vendorLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(vendors || []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bill date</Label>
              <Input type="date" value={billDate} onChange={(e) => handleBillDateChange(e.target.value)} />
            </div>
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
            <Label className="text-xs font-medium">Items received</Label>
            <LineItemsEditor lines={lines} onChange={setLines} />
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
            {gstType !== "none" ? (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxable amount</span>
                  <span className="tabular-nums">{inr(gstPreview.taxableAmount)}</span>
                </div>
                {gstType === "intra" ? (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>CGST</span>
                      <span className="tabular-nums">{inr(gstPreview.cgst)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>SGST</span>
                      <span className="tabular-nums">{inr(gstPreview.sgst)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-muted-foreground">
                    <span>IGST</span>
                    <span className="tabular-nums">{inr(gstPreview.igst)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{inr(gstPreview.total)}</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{inr(gstPreview.total)}</span>
              </div>
            )}

            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Editing replaces the stock movement this bill made — item stock will recompute to match the updated items.
              </p>
            )}

            <div className="border-t pt-4">
              <Button className="w-full" onClick={handleSave} disabled={saveBill.isPending}>
                {saveBill.isPending ? "Saving…" : isEdit ? `Save changes · ${inr(gstPreview.total)}` : `Record bill · ${inr(gstPreview.total)}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
