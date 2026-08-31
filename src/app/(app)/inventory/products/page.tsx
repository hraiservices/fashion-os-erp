"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, ShoppingBag, Pencil, Trash2, AlertTriangle, Printer, Upload, Archive, ArchiveRestore } from "lucide-react";
import { printBarcodeLabel } from "@/lib/barcode";
import { useProducts } from "@/hooks/use-products";
import { useDeleteProduct, useBulkDeleteProducts, useQuickUpdateProduct, useArchiveProduct } from "@/hooks/use-inventory-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRowSelection } from "@/hooks/use-row-selection";
import { isLowStock } from "@/lib/inventory";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Product } from "@/lib/types";

/** Click-to-edit selling price — saves on blur/Enter, Escape cancels, without opening the full edit dialog. */
function EditablePrice({ product, canEdit, userEmail }: { product: Product; canEdit: boolean; userEmail?: string }) {
  const quickUpdate = useQuickUpdateProduct();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(product.sellingPrice);

  function startEdit() {
    if (!canEdit) return;
    setValue(product.sellingPrice);
    setEditing(true);
  }

  async function commit() {
    setEditing(false);
    const num = value;
    if (Number.isNaN(num) || num < 0 || num === product.sellingPrice) return;
    try {
      await quickUpdate.mutateAsync({ id: product.id, sellingPrice: num, userEmail, name: product.name });
      toast.success("Price updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update price");
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        disabled={!canEdit}
        className={cn("rounded px-1.5 py-0.5 tabular-nums", canEdit && "hover:bg-muted")}
        title={canEdit ? "Click to edit" : undefined}
      >
        {inr(product.sellingPrice)}
      </button>
    );
  }

  return (
    <NumberInput
      min={0}
      step="0.01"
      autoFocus
      className="h-7 w-24 text-right tabular-nums"
      value={value}
      onChange={setValue}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function ProductsPageContent() {
  const router = useRouter();
  const { data: products, isLoading } = useProducts();
  const { data: user } = useCurrentUser();
  const deleteProduct = useDeleteProduct();
  const bulkDeleteProducts = useBulkDeleteProducts();
  const archiveProduct = useArchiveProduct();

  const [search, setSearch] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const canManage = !!user?.perms.manageInventory;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products || []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, search]);

  const selection = useRowSelection(filtered.map((p) => p.id));

  async function bulkDelete() {
    setBulkBusy(true);
    setBulkDeleteOpen(false);
    try {
      await bulkDeleteProducts.mutateAsync({ ids: Array.from(selection.selected), userEmail: user?.email });
      toast.success(`${selection.count} product(s) deleted`);
      selection.clear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete products");
    } finally {
      setBulkBusy(false);
    }
  }

  function openEdit(p: Product) {
    router.push(`/inventory/products/${p.id}/edit`);
  }

  async function handleDelete(p: Product) {
    try {
      await deleteProduct.mutateAsync({ id: p.id, name: p.name, userEmail: user?.email });
      toast.success(`${p.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleToggleArchive(p: Product) {
    try {
      await archiveProduct.mutateAsync({ id: p.id, active: !p.active, name: p.name, userEmail: user?.email });
      toast.success(p.active ? `${p.name} archived` : `${p.name} unarchived`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Products"
        description={`${filtered.length} of ${products?.length ?? 0} products`}
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href="/inventory/products/import" />}>
                <Upload className="size-4" /> Import
              </Button>
              <Button nativeButton={false} render={<Link href="/inventory/products/new" />}>
                <Plus className="size-4" /> Add product
              </Button>
            </div>
          )
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" enterKeyHint="search" placeholder="Search name, SKU or category…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
      </div>

      {canManage && selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selection.count} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" className="h-11 px-4 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={() => setBulkDeleteOpen(true)} disabled={bulkBusy}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
            <Button variant="ghost" size="sm" className="h-11 px-4 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={selection.clear} disabled={bulkBusy}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No products yet"
          description="Add the finished goods you sell — sizes, styles, SKUs — and link their bill of materials."
          action={
            canManage && (
              <Button nativeButton={false} render={<Link href="/inventory/products/new" />}>
                <Plus className="size-4" /> Add product
              </Button>
            )
          }
        />
      ) : (
        <div className="hidden overflow-hidden rounded-xl border sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                {canManage && (
                  <TableHead className="w-8">
                    <Checkbox
                      checked={selection.allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selection.someSelected;
                      }}
                      onChange={selection.toggleAll}
                      aria-label="Select all products"
                    />
                  </TableHead>
                )}
                <TableHead className="w-12" />
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">BOM</TableHead>
                {canManage && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const low = isLowStock(p.stockQty, p.lowStockAlert);
                return (
                  <TableRow
                    key={p.id}
                    className={canManage ? "cursor-pointer hover:bg-muted/40" : undefined}
                    onClick={canManage ? () => openEdit(p) : undefined}
                  >
                    {canManage && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selection.selected.has(p.id)} onChange={() => selection.toggle(p.id)} aria-label={`Select ${p.name}`} />
                      </TableCell>
                    )}
                    <TableCell>
                      {p.imageDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageDataUrl} alt="" className="size-9 rounded-md border object-cover bg-white" />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                          <ShoppingBag className="size-3.5" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className={cn(!p.active && "text-muted-foreground")}>{p.name}</span>
                      {!p.active && (
                        <Badge variant="secondary" className="ml-2">
                          Archived
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.sku}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {low && <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />}
                        <span className={low ? "font-medium text-amber-700 dark:text-amber-400" : ""}>{p.stockQty} pcs</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <EditablePrice product={p} canEdit={canManage} userEmail={user?.email} />
                    </TableCell>
                    <TableCell className="text-right">
                      {p.costPrice > 0 ? (
                        <span className={p.sellingPrice - p.costPrice >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                          {inr(p.sellingPrice - p.costPrice)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.bom.length > 0 ? <Badge variant="secondary">{p.bom.length} items</Badge> : <span className="text-xs text-muted-foreground">Not set</span>}
                    </TableCell>
                    {canManage && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {p.barcode && (
                            <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={() => printBarcodeLabel(p)} aria-label={`Print barcode label for ${p.name}`} title="Print barcode label">
                              <Printer className="size-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-11 sm:size-7"
                            onClick={() => handleToggleArchive(p)}
                            disabled={archiveProduct.isPending}
                            aria-label={p.active ? `Archive ${p.name}` : `Unarchive ${p.name}`}
                            title={p.active ? "Archive — hides it from new sales, keeps its history" : "Unarchive"}
                          >
                            {p.active ? <Archive className="size-3.5" /> : <ArchiveRestore className="size-3.5" />}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" aria-label={`Delete ${p.name}`}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {p.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the product and its bill of materials. Stock ledger history is kept for audit purposes.
                                  {p.stockQty > 0 && ` Current stock is ${p.stockQty} pcs.`} If this product has ever had a purchase, sale, or
                                  adjustment recorded against it, deleting it will be refused — use Archive instead to hide it from new sales
                                  while keeping its history intact.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(p)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <MobileRecordList>
          {filtered.map((p) => {
            const low = isLowStock(p.stockQty, p.lowStockAlert);
            return (
              <MobileRecordCard key={p.id} onClick={canManage ? () => openEdit(p) : undefined}>
                <MobileRecordHeader
                  title={!p.active ? <span className="text-muted-foreground">{p.name}</span> : p.name}
                  subtitle={p.sku}
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      {!p.active && <Badge variant="secondary">Archived</Badge>}
                      {inr(p.sellingPrice)}
                    </span>
                  }
                  showChevron={canManage}
                />
                <MobileRecordRow
                  label="Stock"
                  value={
                    <span className={cn("inline-flex items-center gap-1", low && "font-medium text-amber-700 dark:text-amber-400")}>
                      {low && <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />}
                      {p.stockQty} pcs
                    </span>
                  }
                />
                <MobileRecordRow
                  label="Margin"
                  value={
                    p.costPrice > 0 ? (
                      <span className={p.sellingPrice - p.costPrice >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                        {inr(p.sellingPrice - p.costPrice)}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
                <MobileRecordRow label="BOM" value={p.bom.length > 0 ? <Badge variant="secondary">{p.bom.length} items</Badge> : "Not set"} />
              </MobileRecordCard>
            );
          })}
        </MobileRecordList>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} product(s)?</AlertDialogTitle>
            <AlertDialogDescription>This removes each product and its bill of materials. Stock ledger history is kept for audit purposes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} disabled={bulkBusy}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function ProductsPage() {
  return <ProductsPageContent />;
}
