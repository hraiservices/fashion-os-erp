"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Receipt, ChevronRight, Trash2 } from "lucide-react";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useVendors } from "@/hooks/use-vendors";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDeleteBill } from "@/hooks/use-purchase-mutations";
import { useRowSelection } from "@/hooks/use-row-selection";
import { inr, fmtDate } from "@/lib/format";
import { ExportMenu } from "@/components/ui/export-menu";
import { BILL_STATUS_LABELS } from "@/lib/purchases";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function PurchaseBillsPage() {
  const { data: bills, isLoading } = usePurchaseBills();
  const { data: vendors } = useVendors();
  const { data: user } = useCurrentUser();
  const deleteBill = useDeleteBill();
  const canManage = !!user?.perms.managePurchases;

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);
  const totalPayable = useMemo(() => (bills || []).reduce((s, b) => s + b.balance, 0), [bills]);

  const selection = useRowSelection((bills || []).map((b) => b.id));
  const selectedBills = (bills || []).filter((b) => selection.selected.has(b.id));

  async function bulkDelete() {
    setBulkBusy(true);
    setBulkDeleteOpen(false);
    let failed = 0;
    for (const b of selectedBills) {
      try {
        await deleteBill.mutateAsync({ id: b.id, billNumber: b.billNumber, userEmail: user?.email });
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    selection.clear();
    if (failed) toast.error(`${selectedBills.length - failed} deleted, ${failed} failed`);
    else toast.success(`${selectedBills.length} bill(s) deleted — stock reverted`);
  }

  const bulkExportRows = selectedBills.map((b) => ({
    Bill: b.billNumber,
    Date: b.billDate,
    Vendor: vendorNameById.get(b.vendorId) || "",
    Total: b.total,
    Balance: b.balance,
    Status: BILL_STATUS_LABELS[b.paymentStatus],
  }));

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Bills"
        description={`${bills?.length ?? 0} bills · ${inr(totalPayable)} total payable`}
        actions={
          canManage && (
            <Button nativeButton={false} render={<Link href="/purchases/bills/new" />}>
              <Plus className="size-4" /> New bill
            </Button>
          )
        }
      />

      {canManage && !isLoading && selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selection.count} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <ExportMenu rows={bulkExportRows} filename="bills_export" disabled={bulkBusy} />
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
      ) : !bills || bills.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No bills yet"
          description="Recording a bill is what actually receives stock into your raw materials inventory."
          action={
            canManage && (
              <Button nativeButton={false} render={<Link href="/purchases/bills/new" />}>
                <Plus className="size-4" /> New bill
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {canManage && bills.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={selection.allSelected} onChange={selection.toggleAll} aria-label="Select all bills" />
              Select all
            </label>
          )}
          {bills.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-xl border bg-card p-3 hover:bg-muted/40">
              {canManage && (
                <input
                  type="checkbox"
                  checked={selection.selected.has(b.id)}
                  onChange={() => selection.toggle(b.id)}
                  aria-label={`Select bill ${b.billNumber}`}
                  className="shrink-0"
                />
              )}
              <Link href={`/purchases/bills/${b.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{b.billNumber}</span>
                    <Badge variant={b.paymentStatus === "paid" ? "secondary" : "outline"}>{BILL_STATUS_LABELS[b.paymentStatus]}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {vendorNameById.get(b.vendorId) || "Unknown vendor"} · {fmtDate(b.billDate)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{inr(b.total)}</p>
                  {b.balance > 0 && <BalanceDue amount={b.balance} suffix=" due" paidLabel="" className="text-xs" />}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} bill(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This reverses the stock each bill added to raw materials, and cannot be undone. Bills with recorded payments will be skipped — delete those first.
            </AlertDialogDescription>
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
