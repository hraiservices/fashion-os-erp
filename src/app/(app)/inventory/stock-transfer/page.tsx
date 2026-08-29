"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useProducts } from "@/hooks/use-products";
import { useActiveWarehouses } from "@/hooks/use-warehouses";
import { useTransferStock } from "@/hooks/use-inventory-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ItemType } from "@/lib/inventory";

const MAIN_LABEL = "Main / Unassigned";
const itemTypeLabel = (v: unknown) => (v === "product" ? "Product (finished goods)" : "Raw material");

export default function StockTransferPage() {
  const { data: user } = useCurrentUser();
  const { data: rawMaterials } = useRawMaterials();
  const { data: products } = useProducts();
  const { data: warehouses } = useActiveWarehouses();
  const transferStock = useTransferStock();

  const [itemType, setItemType] = useState<ItemType>("raw_material");
  const [itemId, setItemId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState<string>("null");
  const [toWarehouseId, setToWarehouseId] = useState<string>("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");

  const options = useMemo(() => (itemType === "raw_material" ? rawMaterials || [] : products || []), [itemType, rawMaterials, products]);
  const itemLabel = (id: string) => options.find((o) => o.id === id)?.name ?? "";
  const warehouseLabel = (id: string) => (id === "null" ? MAIN_LABEL : (warehouses || []).find((w) => w.id === id)?.name ?? "");

  async function handleSubmit() {
    const q = parseFloat(qty);
    if (!itemId) return toast.error("Select an item");
    if (!q || q <= 0) return toast.error("Enter a quantity greater than zero");
    if (!toWarehouseId) return toast.error("Select a destination warehouse");
    const item = options.find((o) => o.id === itemId);
    try {
      await transferStock.mutateAsync({
        itemType,
        itemId,
        itemName: item?.name || "",
        fromWarehouseId: fromWarehouseId === "null" ? null : fromWarehouseId,
        toWarehouseId,
        qty: q,
        note,
        userEmail: user?.email,
      });
      toast.success(`Transferred ${q} ${item?.name} to ${warehouseLabel(toWarehouseId)}`);
      setItemId("");
      setQty("");
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to transfer stock");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/inventory/warehouses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Warehouses
      </Link>
      <PageHeader title="Stock Transfer" description="Move stock between warehouses" />

      {!warehouses || warehouses.length === 0 ? (
        <EmptyState icon={ArrowRightLeft} title="No warehouses yet" description="Add at least one warehouse before transferring stock." />
      ) : (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ArrowRightLeft className="size-4" /> Transfer stock
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
                  <SelectTrigger className="h-10 w-full">
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
                  <SelectTrigger className="h-10 w-full">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">From warehouse</Label>
                <Select value={fromWarehouseId} onValueChange={(v) => v && setFromWarehouseId(v)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue>{warehouseLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">{MAIN_LABEL}</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">To warehouse</Label>
                <Select value={toWarehouseId} onValueChange={(v) => v && setToWarehouseId(v)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Select destination…">{warehouseLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">{MAIN_LABEL}</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Quantity</Label>
              <Input type="number" inputMode="decimal" step="0.001" placeholder="e.g. 10" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Note</Label>
              <Textarea placeholder="Optional" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Button onClick={handleSubmit} disabled={transferStock.isPending}>
              {transferStock.isPending ? "Transferring…" : "Transfer stock"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
