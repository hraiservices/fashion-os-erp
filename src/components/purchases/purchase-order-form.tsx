"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useVendors } from "@/hooks/use-vendors";
import { useSavePurchaseOrder } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { genPoNumber } from "@/lib/purchases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineItemsEditor, linesToItems, blankLine, lineFromItem, type EditableLine } from "@/components/purchases/line-items-editor";
import { inr } from "@/lib/format";
import type { PurchaseOrder } from "@/lib/types";

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
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">{isEdit ? `Edit purchase order · ${poNumber}` : `New purchase order · ${poNumber}`}</CardTitle>
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
              <Label className="text-xs font-medium">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Items</Label>
            <LineItemsEditor lines={lines} onChange={setLines} />
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
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{inr(total)}</span>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={savePo.isPending}>
              {savePo.isPending ? "Saving…" : isEdit ? "Save changes" : "Create purchase order"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
