"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Building2, Package2, Tag, FileText, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseOrder } from "@/hooks/use-purchase-orders";
import { useSaveBill } from "@/hooks/use-purchase-mutations";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { useCurrentUser } from "@/hooks/use-current-user";
import { genBillNumber } from "@/lib/purchases";
import { computeGst, GST_TYPE_LABELS, type GstType } from "@/lib/gst";
import { PAYMENT_TERMS, PAYMENT_TERM_LABELS, dueDateFromTerm, type PaymentTerm } from "@/lib/payment-terms";
import { inr } from "@/lib/format";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { LineItemsEditor, linesToItems, blankLine, lineFromItem, type EditableLine } from "@/components/purchases/line-items-editor";
import type { PurchaseBill } from "@/lib/types";

const gstTypeLabel = (v: unknown) => GST_TYPE_LABELS[v as GstType] ?? "";
const paymentTermLabel = (v: unknown) => PAYMENT_TERM_LABELS[v as PaymentTerm] ?? "";

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

  useSyncFromSource(prefillPo, (po) => {
    if (!po) return;
    setVendorId(po.vendorId);
    setLines(po.items.map((item, i) => lineFromItem(item, `po-${i}`)));
  });

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
    <div className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/purchases/bills" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Bills</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Bill" : "New Bill"}</h1>
            <p className="text-[11px] text-muted-foreground font-mono">{billNumber}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Vendor & dates */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Building2} label="Vendor & dates" />
            <div className="mb-4">
              <FieldGroup label="Vendor" required>
                <Select value={vendorId} onValueChange={(v) => v && setVendorId(v)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Select vendor…">{vendorLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(vendors || []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldGroup>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Bill date" required>
                <DatePicker value={billDate} onChange={handleBillDateChange} />
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
            </div>
          </div>

          {/* Items received */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Package2} label="Items received" />
            <LineItemsEditor lines={lines} onChange={setLines} />
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
            <FieldGroup label="Internal notes">
              <Textarea rows={3} placeholder="Ref number, quality remarks, delivery details…" value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" />
            </FieldGroup>
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="mt-5 lg:mt-0 lg:sticky lg:top-[61px] space-y-4">
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="bg-primary px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">Bill summary</p>
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
            {isEdit && (
              <p className="px-5 pb-2 text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                Editing replaces the stock movement this bill made — inventory will recompute to match the updated items.
              </p>
            )}
            <div className="border-t px-5 py-4">
              <Button className="w-full h-10 gap-2" onClick={handleSave} disabled={saveBill.isPending}>
                <ShoppingCart className="size-4" />
                {saveBill.isPending ? "Saving…" : isEdit ? "Save Changes" : "Record Bill"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <FormActionBar>
        <Button variant="outline" size="sm" onClick={() => router.back()} disabled={saveBill.isPending}>Cancel</Button>
        <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={handleSave} disabled={saveBill.isPending}>
          <ShoppingCart className="size-3.5" />
          {saveBill.isPending ? "Saving…" : isEdit ? `Save Changes · ${inr(gstPreview.total)}` : `Record Bill · ${inr(gstPreview.total)}`}
        </Button>
      </FormActionBar>
    </div>
  );
}
