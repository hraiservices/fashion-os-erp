"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Package, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useRawMaterials } from "@/hooks/use-raw-materials";
import { useDeleteRawMaterial } from "@/hooks/use-inventory-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { isLowStock } from "@/lib/inventory";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
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
import type { RawMaterial } from "@/lib/types";

function RawMaterialsPageContent() {
  const router = useRouter();
  const { data: materials, isLoading } = useRawMaterials();
  const { data: user } = useCurrentUser();
  const deleteMaterial = useDeleteRawMaterial();

  const [search, setSearch] = useState("");

  const canManage = !!user?.perms.manageInventory;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (materials || []).filter((m) => !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
  }, [materials, search]);

  function openEdit(m: RawMaterial) {
    router.push(`/inventory/raw-materials/${m.id}/edit`);
  }

  async function handleDelete(m: RawMaterial) {
    try {
      await deleteMaterial.mutateAsync({ id: m.id, name: m.name, userEmail: user?.email });
      toast.success(`${m.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Raw Materials"
        description={`${filtered.length} of ${materials?.length ?? 0} materials`}
        actions={
          canManage && (
            <Button nativeButton={false} render={<Link href="/inventory/raw-materials/new" />}>
              <Plus className="size-4" /> Add material
            </Button>
          )
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search name or category…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search raw materials" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No raw materials yet"
          description="Add fabric, thread, buttons and other materials you purchase and consume in manufacturing."
          action={
            canManage && (
              <Button nativeButton={false} render={<Link href="/inventory/raw-materials/new" />}>
                <Plus className="size-4" /> Add material
              </Button>
            )
          }
        />
      ) : (
        <div className="hidden overflow-hidden rounded-xl border sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Cost/unit</TableHead>
                {canManage && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const low = isLowStock(m.stockQty, m.lowStockAlert);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">{m.category || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {low && <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />}
                        <span className={low ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                          {m.stockQty} {m.unitName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{inr(m.costPerUnit)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={() => openEdit(m)} aria-label={`Edit ${m.name}`}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" aria-label={`Delete ${m.name}`}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {m.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the material record. Stock ledger history for it is kept for audit purposes.
                                  {m.stockQty > 0 && ` Current stock is ${m.stockQty} ${m.unitName}.`}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(m)}>Delete</AlertDialogAction>
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
          {filtered.map((m) => {
            const low = isLowStock(m.stockQty, m.lowStockAlert);
            return (
              <MobileRecordCard key={m.id} onClick={canManage ? () => openEdit(m) : undefined}>
                <MobileRecordHeader title={m.name} subtitle={m.category || undefined} value={inr(m.costPerUnit)} showChevron={canManage} />
                <MobileRecordRow
                  label="Stock"
                  value={
                    <span className={cn("inline-flex items-center gap-1", low && "font-medium text-amber-700 dark:text-amber-400")}>
                      {low && <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />}
                      {m.stockQty} {m.unitName}
                    </span>
                  }
                />
              </MobileRecordCard>
            );
          })}
        </MobileRecordList>
      )}

    </div>
  );
}

export default function RawMaterialsPage() {
  return <RawMaterialsPageContent />;
}
