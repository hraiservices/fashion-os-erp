"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Package2, FileText, ClipboardList, Truck } from "lucide-react";
import { useVendors } from "@/hooks/use-vendors";
import { useSavePurchaseOrder } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { genPoNumber, computePurchaseTotal } from "@/lib/purchases";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchSelect } from "@/components/ui/search-select";
import { AddVendorDialog } from "@/components/purchases/add-vendor-dialog";
import { LineItemsEditor, linesToItems, blankLine, lineFromItem, type EditableLine } from "@/components/purchases/line-items-editor";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { inr } from "@/lib/format";
import type { PurchaseOrder } from "@/lib/types";
import { istDateString } from "@/lib/ist-date";
import { BackLink } from "@/components/ui/back-link";

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
      <Label className="text-sm font-bold text-foreground/80">
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
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [vendorId, setVendorId] = useState(existing?.vendorId || "");
  const [date, setDate] = useState(existing?.date || istDateString());
  const [lines, setLines] = useState<EditableLine[]>(
    existing ? existing.items.map((item, i) => lineFromItem(item, `existing-${i}`)) : [blankLine()]
  );
  const [shippingCharges, setShippingCharges] = useState(existing?.shippingCharges ? String(existing.shippingCharges) : "");
  const [otherCharges, setOtherCharges] = useState(existing?.otherCharges ? String(existing.otherCharges) : "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [notesOpen, setNotesOpen] = useState(false);

  const vendorLabel = (id: string) => (vendors || []).find((v) => v.id === id)?.name ?? "";
  const itemsTotal = linesToItems(lines).reduce((s, i) => s + i.amount, 0);
  const shipping = Math.max(0, parseFloat(shippingCharges) || 0);
  const other = Math.max(0, parseFloat(otherCharges) || 0);
  const total = computePurchaseTotal(itemsTotal, shipping, other);

  async function handleSave() {
    if (!vendorId) return toast.error("Select a vendor");
    const items = linesToItems(lines);
    if (items.length === 0) return toast.error("Add at least one item");

    try {
      const res = await savePo.mutateAsync({ id: existing?.id, poNumber, vendorId, date, status: existing?.status || "draft", items, shippingCharges: shipping, otherCharges: other, notes, userEmail: user?.email });
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
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6">
          <BackLink href="/purchases/orders">
            <span className="hidden sm:inline">Purchase orders</span>
          </BackLink>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate">{isEdit ? "Edit Purchase Order" : "New Purchase Order"}</h1>
            <p className="text-[11px] text-muted-foreground font-mono truncate">{poNumber}</p>
          </div>
          {/* Duplicate of the bottom FormActionBar — mobile only, so Create/Save is reachable
             without scrolling all the way down. */}
          <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
            <Button variant="outline" size="sm" onClick={() => router.back()} disabled={savePo.isPending}>
              Cancel
            </Button>
            <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground" onClick={handleSave} disabled={savePo.isPending}>
              <ClipboardList className="size-3.5" />
              {savePo.isPending ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Vendor & date */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Building2} label="Vendor & date" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Vendor" required>
                <SearchSelect
                  inputClassName="h-10"
                  placeholder="Type to search vendor…"
                  value={vendorId}
                  fallbackLabel={vendorLabel(vendorId)}
                  options={(vendors || []).map((v) => ({ value: v.id, label: v.name, sublabel: v.mobile || undefined }))}
                  onSelect={setVendorId}
                  createActions={[{ label: "Add new vendor", onCreate: (name) => { setNewVendorName(name); setAddVendorOpen(true); } }]}
                />
                <AddVendorDialog open={addVendorOpen} onOpenChange={setAddVendorOpen} defaultName={newVendorName} onCreated={(id) => setVendorId(id)} />
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

          {/* Shipping and other charges — added to the total (no GST on them). */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Truck} label="Charges" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground/80">Shipping charges</Label>
                <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" value={shippingCharges} onChange={(e) => setShippingCharges(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground/80">Other charges</Label>
                <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} className="h-10" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <Accordion value={notesOpen ? ["notes"] : []} onValueChange={(v) => setNotesOpen(v.includes("notes"))}>
              <AccordionItem value="notes" className="border-b-0">
                <AccordionTrigger className="border-b pb-2 mb-4 hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                      <FileText className="size-3.5 text-primary" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <FieldGroup label="Notes to vendor" hint="Delivery instructions, quality specs, special requirements.">
                    <Textarea rows={3} placeholder="Special requirements, delivery address, quality specs…" value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" />
                  </FieldGroup>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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
              {(shipping > 0 || other > 0) && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Items</span><span className="tabular-nums">{inr(itemsTotal)}</span>
                  </div>
                  {shipping > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Shipping charges</span><span className="tabular-nums">{inr(shipping)}</span>
                    </div>
                  )}
                  {other > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Other charges</span><span className="tabular-nums">{inr(other)}</span>
                    </div>
                  )}
                </>
              )}
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

      <FormActionBar className="justify-start sm:justify-end">
        <Button
          variant="outline"
          size="lg"
          className="h-11 px-4 text-sm sm:h-7 sm:px-2.5 sm:text-[0.8rem]"
          onClick={() => router.back()}
          disabled={savePo.isPending}
        >
          Cancel
        </Button>
        <Button
          size="lg"
          className="h-11 flex-1 gap-1.5 bg-primary px-4 text-sm text-primary-foreground sm:h-7 sm:flex-none sm:px-2.5 sm:text-[0.8rem]"
          onClick={handleSave}
          disabled={savePo.isPending}
        >
          <ClipboardList className="size-3.5" />
          {savePo.isPending ? "Saving…" : isEdit ? `Save Changes · ${inr(total)}` : `Create PO · ${inr(total)}`}
        </Button>
      </FormActionBar>
    </div>
  );
}
