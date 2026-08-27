"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Building2, Package2, FileText, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useVendors } from "@/hooks/use-vendors";
import { useSavePurchaseOrder } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { genPoNumber } from "@/lib/purchases";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { LineItemsEditor, linesToItems, blankLine, lineFromItem, type EditableLine } from "@/components/purchases/line-items-editor";
import { inr } from "@/lib/format";
import type { PurchaseOrder } from "@/lib/types";

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

export function PurchaseOrderForm({ existing }: { existing?: PurchaseOrder }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: vendors } = useVendors();
  const savePo = useSavePurchaseOrder();
  const isEdit = !!existing;

  const [poNumber] = useState(existing?.poNumber || genPoNumber());
  const [vendorId, setVendorId] = useState(existing?.vendorId || "");
  const [date, setDate] = useState(existing?.date || new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<EditableLine[]>(
    existing ? existing.items.map((item, i) => lineFromItem(item, `existing-${i}`)) : [blankLine()]
  );
  const [notes, setNotes] = useState(existing?.notes || "");

  const vendorLabel = (id: string) => (vendors || []).find((v) => v.id === id)?.name ?? "";
  const total = linesToItems(lines).reduce((s, i) => s + i.amount, 0);

  async function handleSave() {
    if (!vendorId) return toast.error("Select a vendor");
    const items = linesToItems(lines);
    if (items.length === 0) return toast.error("Add at least one item");

    try {
      const res = await savePo.mutateAsync({ id: existing?.id, poNumber, vendorId, date, status: existing?.status || "draft", items, notes, userEmail: user?.email });
      toast.success(isEdit ? `Purchase order ${poNumber} updated` : `Purchase order ${poNumber} created`);
      router.push(`/purchases/orders/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save purchase order");
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/purchases/orders" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Purchase orders</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Purchase Order" : "New Purchase Order"}</h1>
            <p className="text-[11px] text-muted-foreground font-mono">{poNumber}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Vendor & date */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Building2} label="Vendor & date" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <FieldGroup label="Order date" required>
                <DatePicker value={date} onChange={setDate} />
              </FieldGroup>
            </div>
          </div>

          {/* Items */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Package2} label="Items to order" />
            <LineItemsEditor lines={lines} onChange={setLines} />
          </div>

          {/* Notes */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={FileText} label="Notes" />
            <FieldGroup label="Notes to vendor" hint="Delivery instructions, quality specs, special requirements.">
              <Textarea rows={3} placeholder="Special requirements, delivery address, quality specs…" value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" />
            </FieldGroup>
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="mt-5 lg:mt-0 lg:sticky lg:top-[61px] space-y-4">
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="bg-primary px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">PO summary</p>
              <p className="text-2xl font-bold text-primary-foreground tabular-nums">{inr(total)}</p>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm">
              <div className="flex justify-between border-t pt-2 font-semibold text-base">
                <span>Estimated total</span><span className="tabular-nums">{inr(total)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Actual bill amounts may vary. Convert to a bill when goods are received.</p>
            </div>
            <div className="border-t px-5 py-4">
              <Button className="w-full h-10 gap-2" onClick={handleSave} disabled={savePo.isPending}>
                <ClipboardList className="size-4" />
                {savePo.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Purchase Order"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <FormActionBar>
        <Button variant="outline" size="sm" onClick={() => router.back()} disabled={savePo.isPending}>Cancel</Button>
        <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={handleSave} disabled={savePo.isPending}>
          <ClipboardList className="size-3.5" />
          {savePo.isPending ? "Saving…" : isEdit ? `Save Changes · ${inr(total)}` : `Create PO · ${inr(total)}`}
        </Button>
      </FormActionBar>
    </div>
  );
}
