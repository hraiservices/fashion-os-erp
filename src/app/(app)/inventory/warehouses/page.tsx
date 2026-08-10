"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Warehouse as WarehouseIcon, Plus, Pencil, Trash2, ArrowRightLeft } from "lucide-react";
import { useWarehouses } from "@/hooks/use-warehouses";
import { useSaveWarehouse, useDeleteWarehouse } from "@/hooks/use-warehouse-mutations";
import { useWarehouseStock } from "@/hooks/use-warehouse-stock";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import type { Warehouse } from "@/lib/types";

const emptyForm = { id: undefined as string | undefined, name: "", address: "", isDefault: false, active: true };

export default function WarehousesPage() {
  const { data: warehouses, isLoading } = useWarehouses();
  const { data: stockRows } = useWarehouseStock();
  const { data: user } = useCurrentUser();
  const saveWarehouse = useSaveWarehouse();
  const deleteWarehouse = useDeleteWarehouse();

  const canManage = !!user?.perms.manageInventory;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const skuCountByWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of stockRows || []) {
      if (r.stockQty === 0) continue;
      const key = r.warehouseId || "null";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [stockRows]);

  function openNew() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(w: Warehouse) {
    setForm({ id: w.id, name: w.name, address: w.address, isDefault: w.isDefault, active: w.active });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Enter a warehouse name");
    try {
      await saveWarehouse.mutateAsync({ ...form, userEmail: user?.email });
      toast.success(form.id ? "Warehouse updated" : "Warehouse added");
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save warehouse");
    }
  }

  async function handleDelete(w: Warehouse) {
    try {
      await deleteWarehouse.mutateAsync({ id: w.id, name: w.name, userEmail: user?.email });
      toast.success(`${w.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Warehouses"
        description={`${warehouses?.length ?? 0} locations`}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/inventory/stock-transfer" />}>
              <ArrowRightLeft className="size-4" /> Stock Transfer
            </Button>
            {canManage && (
              <Button onClick={openNew}>
                <Plus className="size-4" /> Add warehouse
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !warehouses || warehouses.length === 0 ? (
        <EmptyState
          icon={WarehouseIcon}
          title="No warehouses yet"
          description="Add your godowns or store locations to track stock by warehouse."
          action={
            canManage && (
              <Button onClick={openNew}>
                <Plus className="size-4" /> Add warehouse
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {warehouses.map((w) => (
            <div key={w.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{w.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {w.address || "No address"} · {skuCountByWarehouse.get(w.id) || 0} items in stock
                </p>
              </div>
              {w.isDefault && <Badge variant="secondary">Default</Badge>}
              {!w.active && (
                <Badge variant="outline" className="text-muted-foreground">
                  Inactive
                </Badge>
              )}
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(w)} aria-label={`Edit ${w.name}`}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${w.name}`}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {w.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Past stock movements for this warehouse stay in the ledger history. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(w)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit warehouse" : "Add warehouse"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Warehouse, Andheri Store" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Address</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Optional" />
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Set as default</p>
                <p className="text-xs text-muted-foreground">Used when a movement doesn't specify a warehouse.</p>
              </div>
              <input type="checkbox" className="size-4" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
            </label>
            <label className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">Active</p>
              <input type="checkbox" className="size-4" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveWarehouse.isPending}>
              {saveWarehouse.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
