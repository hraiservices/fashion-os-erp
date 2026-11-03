"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, ChevronRight, Search } from "lucide-react";
import { FileTextDuotoneIcon } from "@/components/icons/duotone-icons";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { useVendors } from "@/hooks/use-vendors";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useCancelPurchaseOrder } from "@/hooks/use-purchase-mutations";
import { useRowSelection } from "@/hooks/use-row-selection";
import { inr, fmtDate } from "@/lib/format";
import { PO_STATUS_LABELS } from "@/lib/purchases";
import { PageHeader } from "@/components/ui/page-header";
import { NewButton } from "@/components/ui/new-button";
import { ListDateBar, useListDateFilter } from "@/components/ui/list-date-filter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function PurchaseOrdersPage() {
  const { data: orders, isLoading } = usePurchaseOrders();
  const dated = useListDateFilter(orders, (x) => x.date, "all");
  const { data: vendors } = useVendors();
  const { data: user } = useCurrentUser();
  const cancelPO = useCancelPurchaseOrder();
  const canManage = !!user?.perms.managePurchases;
  const [search, setSearch] = useState("");
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dated.rows;
    return dated.rows.filter((o) => o.poNumber.toLowerCase().includes(q) || (vendorNameById.get(o.vendorId) || "").toLowerCase().includes(q));
  }, [dated.rows, vendorNameById, search]);

  const selection = useRowSelection(filtered.map((o) => o.id));
  // Only active POs can be cancelled — a cancelled one selected again is just skipped, not an error.
  const selectedOrders = filtered.filter((o) => selection.selected.has(o.id) && o.status !== "cancelled");

  async function bulkCancel() {
    setBulkBusy(true);
    setBulkCancelOpen(false);
    let failed = 0;
    for (const o of selectedOrders) {
      try {
        await cancelPO.mutateAsync({ id: o.id, poNumber: o.poNumber, userEmail: user?.email });
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    selection.clear();
    if (failed) toast.error(`${selectedOrders.length - failed} cancelled, ${failed} failed`);
    else toast.success(`${selectedOrders.length} purchase order(s) cancelled`);
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Purchase Orders"
        description={`${filtered.length} of ${orders?.length ?? 0} purchase orders`}
        actions={
          canManage && (
            <NewButton href="/purchases/orders/new" ariaLabel="New PO" />
          )
        }
      />

      <ListDateBar dr={dated.dr} shown={dated.rows.length} total={orders?.length ?? 0} noun="purchase orders" />

      {!isLoading && orders && orders.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" placeholder="Search PO number or vendor…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search purchase orders" />
        </div>
      )}

      {canManage && !isLoading && selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selection.count} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" className="h-11 px-4 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={() => setBulkCancelOpen(true)} disabled={bulkBusy || selectedOrders.length === 0}>
              <Ban className="size-3.5" /> Cancel
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
      ) : !orders || orders.length === 0 ? (
        <EmptyState
          icon={FileTextDuotoneIcon}
          title="No purchase orders yet"
          description="Create a PO to plan what you're ordering from a vendor before the bill arrives."
          action={
            canManage && (
              <NewButton href="/purchases/orders/new" ariaLabel="New PO" />
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileTextDuotoneIcon} title="No matching purchase orders" description={`No purchase orders found for "${search}".`} />
      ) : (
        <div className="space-y-2">
          {canManage && filtered.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox checked={selection.allSelected} onChange={selection.toggleAll} aria-label="Select all purchase orders" />
              Select all
            </label>
          )}
          {filtered.map((o) => (
            <div key={o.id} className="flex items-center gap-2 rounded-xl border bg-card p-3 hover:bg-muted/40">
              {canManage && <Checkbox checked={selection.selected.has(o.id)} onChange={() => selection.toggle(o.id)} aria-label={`Select ${o.poNumber}`} />}
              <Link href={`/purchases/orders/${o.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{o.poNumber}</span>
                    <Badge variant="outline">{PO_STATUS_LABELS[o.status]}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {vendorNameById.get(o.vendorId) || "Unknown vendor"} · {fmtDate(o.date)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(o.total)}</p>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {selectedOrders.length} purchase order(s)?</AlertDialogTitle>
            <AlertDialogDescription>This marks them as cancelled. It has no effect on stock since POs don&apos;t move inventory. Already-cancelled ones in your selection are skipped.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={bulkCancel}>Cancel orders</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
