"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Truck, Pencil, Trash2, ChevronRight, Upload } from "lucide-react";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useDeleteVendor } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRowSelection } from "@/hooks/use-row-selection";
import { PageHeader } from "@/components/ui/page-header";
import { NewButton } from "@/components/ui/new-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";
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
import type { Vendor } from "@/lib/types";

function VendorsPageContent() {
  const router = useRouter();
  const { data: vendors, isLoading } = useVendors();
  const { data: bills } = usePurchaseBills();
  const { data: user } = useCurrentUser();
  const deleteVendor = useDeleteVendor();

  const [search, setSearch] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const canManage = !!user?.perms.managePurchases;

  const payableByVendor = useMemo(() => {
    const map = new Map<string, number>();
    (bills || []).forEach((b) => map.set(b.vendorId, (map.get(b.vendorId) || 0) + b.balance));
    return map;
  }, [bills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vendors || []).filter((v) => !q || v.name.toLowerCase().includes(q) || v.mobile.includes(q) || v.gstin.toLowerCase().includes(q));
  }, [vendors, search]);

  const selection = useRowSelection(filtered.map((v) => v.id));
  const selectedVendors = filtered.filter((v) => selection.selected.has(v.id));

  function openEdit(v: Vendor, e: React.MouseEvent) {
    e.preventDefault();
    router.push(`/purchases/vendors/${v.id}/edit`);
  }

  async function handleDelete(v: Vendor) {
    try {
      await deleteVendor.mutateAsync({ id: v.id, name: v.name, userEmail: user?.email });
      toast.success(`${v.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function bulkDelete() {
    setBulkBusy(true);
    setBulkDeleteOpen(false);
    let failed = 0;
    for (const v of selectedVendors) {
      try {
        await deleteVendor.mutateAsync({ id: v.id, name: v.name, userEmail: user?.email });
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    selection.clear();
    if (failed) toast.error(`${selectedVendors.length - failed} deleted, ${failed} failed`);
    else toast.success(`${selectedVendors.length} vendor(s) deleted`);
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Vendors"
        description={`${filtered.length} of ${vendors?.length ?? 0} vendors`}
        actions={
          canManage && (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <Button variant="outline" className="w-full sm:w-auto" nativeButton={false} render={<Link href="/purchases/vendors/import" />}>
                <Upload className="size-4" /> Import
              </Button>
              <NewButton href="/purchases/vendors/new" ariaLabel="Add vendor" className="w-full sm:w-auto" />
            </div>
          )
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" enterKeyHint="search" placeholder="Search name, mobile or GSTIN…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search vendors" />
      </div>

      {canManage && !isLoading && selection.count > 0 && (
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
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No vendors yet"
          description="Add the suppliers you purchase fabric and materials from."
          action={
            canManage && (
              <NewButton href="/purchases/vendors/new" ariaLabel="Add vendor" />
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {canManage && filtered.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox checked={selection.allSelected} onChange={selection.toggleAll} aria-label="Select all vendors" />
              Select all
            </label>
          )}
          {filtered.map((v) => {
            const payable = payableByVendor.get(v.id) || 0;
            return (
              <div key={v.id} className="flex items-center gap-2 rounded-xl border bg-card p-3 hover:bg-muted/40">
                {canManage && (
                  <Checkbox checked={selection.selected.has(v.id)} onChange={() => selection.toggle(v.id)} aria-label={`Select ${v.name}`} />
                )}
                <Link href={`/purchases/vendors/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[v.mobile, v.gstin].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                {payable > 0 && <BalanceDue amount={payable} suffix=" due" paidLabel="" className="shrink-0 text-sm" />}
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={(e) => openEdit(v, e)} aria-label={`Edit ${v.name}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" aria-label={`Delete ${v.name}`} onClick={(e) => e.preventDefault()}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {v.name}?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone. Bills already recorded against this vendor are kept.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(v)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} vendor(s)?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Bills already recorded against these vendors are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function VendorsPage() {
  return <VendorsPageContent />;
}
