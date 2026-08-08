"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { useRecordStockAdjustment } from "@/hooks/use-inventory-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ItemType } from "@/lib/inventory";

const itemTypeLabel = (v: unknown) => (v === "product" ? "Product (finished goods)" : "Raw material");

export function StockAdjustmentForm() {
  const { data: user } = useCurrentUser();
  const { data: rawMaterials } = useRawMaterials();
  const { data: products } = useProducts();
  const recordAdjustment = useRecordStockAdjustment();

  const [itemType, setItemType] = useState<ItemType>("raw_material");
  const [itemId, setItemId] = useState("");
  const [movement, setMovement] = useState("");
  const [note, setNote] = useState("");

  const options = useMemo(() => (itemType === "raw_material" ? rawMaterials || [] : products || []), [itemType, rawMaterials, products]);
  const itemLabel = (id: string) => options.find((o) => o.id === id)?.name ?? "";

  async function handleSubmit() {
    const qty = parseFloat(movement);
    if (!itemId) return toast.error("Select an item");
    if (!qty) return toast.error("Enter a non-zero quantity");
    if (!note.trim()) return toast.error("A note is required for adjustments");

    const item = options.find((o) => o.id === itemId);
    try {
      await recordAdjustment.mutateAsync({ itemType, itemId, itemName: item?.name || "", movement: qty, note, userEmail: user?.email });
      toast.success(`Stock ${qty > 0 ? "increased" : "decreased"} for ${item?.name}`);
      setItemId("");
      setMovement("");
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record adjustment");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wrench className="size-4" /> Manual stock adjustment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Item type</Label>
            <Select
              value={itemType}
              onValueChange={(v) => {
                if (!v) return;
                setItemType(v as ItemType);
                setItemId("");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{itemTypeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="raw_material">Raw material</SelectItem>
                <SelectItem value="product">Product (finished goods)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Item</Label>
            <Select value={itemId} onValueChange={(v) => v && setItemId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select item…">{itemLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Quantity change (use negative to reduce stock)</Label>
          <Input type="number" step="0.001" placeholder="e.g. 5 or -2.5" value={movement} onChange={(e) => setMovement(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Reason *</Label>
          <Textarea placeholder="e.g. Physical stock count correction" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <Button onClick={handleSubmit} disabled={recordAdjustment.isPending}>
          {recordAdjustment.isPending ? "Saving…" : "Record adjustment"}
        </Button>
      </CardContent>
    </Card>
  );
}
