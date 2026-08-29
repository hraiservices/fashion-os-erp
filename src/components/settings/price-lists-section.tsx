"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Tag } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useProducts } from "@/hooks/use-products";
import {
  usePriceLists,
  usePriceListItems,
  useSavePriceList,
  useDeletePriceList,
  useSavePriceListItem,
  useDeletePriceListItem,
} from "@/hooks/use-price-lists";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { inr } from "@/lib/format";

/** Settings > Price Lists — customer-tier product price overrides, assigned per-customer in the CRM edit form. */
export function PriceListsSection() {
  const { data: user } = useCurrentUser();
  const { data: priceLists, isLoading } = usePriceLists();
  const { data: products } = useProducts();
  const savePriceList = useSavePriceList();
  const deletePriceList = useDeletePriceList();
  const saveItem = useSavePriceListItem();
  const deleteItem = useDeletePriceListItem();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newProductId, setNewProductId] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const active = (priceLists || []).find((pl) => pl.id === activeId) || (priceLists || [])[0] || null;
  const { data: items } = usePriceListItems(active?.id || "");

  async function addPriceList() {
    const name = newName.trim();
    if (!name) return;
    try {
      const id = await savePriceList.mutateAsync({ name, notes: "", userEmail: user?.email });
      setNewName("");
      setActiveId(id);
      toast.success("Price list created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create price list");
    }
  }

  async function removePriceList(id: string) {
    try {
      await deletePriceList.mutateAsync(id);
      if (activeId === id) setActiveId(null);
      toast.success("Price list deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete price list");
    }
  }

  async function addItem() {
    if (!active || !newProductId || !newPrice) return;
    try {
      await saveItem.mutateAsync({ priceListId: active.id, productId: newProductId, price: parseFloat(newPrice) || 0 });
      setNewProductId("");
      setNewPrice("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save price");
    }
  }

  async function removeItem(id: string) {
    if (!active) return;
    try {
      await deleteItem.mutateAsync({ id, priceListId: active.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove price");
    }
  }

  const productName = (id: string) => (products || []).find((p) => p.id === id)?.name || "Unknown product";
  const itemProductIds = new Set((items || []).map((i) => i.productId));
  const availableProducts = (products || []).filter((p) => !itemProductIds.has(p.id));

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Price lists</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {(priceLists || []).map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => setActiveId(pl.id)}
              className={`rounded-lg border px-3 py-1 text-xs ${pl.id === active?.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
            >
              {pl.name}
            </button>
          ))}
          <Input placeholder="New price list name" className="h-8 w-44" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPriceList()} />
          <Button variant="outline" size="sm" onClick={addPriceList} disabled={savePriceList.isPending}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>

        {!active ? (
          <EmptyState icon={Tag} title="No price lists yet" description="Create one above, then assign it to a customer from their CRM profile." />
        ) : (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{active.name}</p>
              <Button variant="ghost" size="sm" onClick={() => removePriceList(active.id)}>
                <Trash2 className="size-3.5" /> Delete list
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Select value={newProductId} onValueChange={(v) => v && setNewProductId(v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Add a product override…" />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} (default {inr(p.sellingPrice)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="Price" className="w-28" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
              <Button size="sm" onClick={addItem} disabled={!newProductId || !newPrice || saveItem.isPending}>
                <Plus className="size-3.5" /> Add
              </Button>
            </div>

            {(items || []).length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">No product overrides yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Override price</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(items || []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{productName(item.productId)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(item.price)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" onClick={() => removeItem(item.id)} aria-label="Remove">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
