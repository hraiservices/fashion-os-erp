"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Truck, Pencil, Trash2, Upload } from "lucide-react";
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
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
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

  function openEdit(v: Vendor) {
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

  const columns: DataTableColumn<Vendor>[] = [
    { key: "name", header: "Name", alwaysVisible: true, sortValue: (v) => v.name.toLowerCase(), render: (v) => <span className="font-medium">{v.name}</span> },
    { key: "mobile", header: "Mobile", sortValue: (v) => v.mobile, render: (v) => v.mobile || "—" },
    { key: "gstin", header: "GSTIN", sortValue: (v) => v.gstin, render: (v) => v.gstin || "—" },
    {
      key: "balance",
      header: "Balance due",
      align: "right",
      sortValue: (v) => payableByVendor.get(v.id) || 0,
      render: (v) => {
        const payable = payableByVendor.get(v.id) || 0;
        return <span className={payable > 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}>{payable > 0 ? `₹${payable.toLocaleString("en-IN")} due` : "—"}</span>;
      },
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            alwaysVisible: true,
            align: "right" as const,
            render: (v: Vendor) => (
              <div className="flex shrink-0 items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon-sm" className="size-8" onClick={() => openEdit(v)} aria-label={`Edit ${v.name}`}>
                  <Pencil className="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button variant="ghost" size="icon-sm" className="size-8" aria-label={`Delete ${v.name}`}>
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
            ),
          } satisfies DataTableColumn<Vendor>,
        ]
      : []),
  ];

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
        <DataTable
          columns={columns}
          rows={filtered}
          getHref={(v) => `/purchases/vendors/${v.id}`}
          storageKey="vendors-table"
          selectedIds={canManage ? selection.selected : undefined}
          onToggleRow={canManage ? selection.toggle : undefined}
          onToggleAll={canManage ? selection.toggleAll : undefined}
        />
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
