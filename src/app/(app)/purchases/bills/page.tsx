"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Search } from "lucide-react";
import { ReceiptDuotoneIcon } from "@/components/icons/duotone-icons";
import { usePurchaseBills, type PurchaseBillWithBalance } from "@/hooks/use-purchase-bills";
import { useVendors } from "@/hooks/use-vendors";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDeleteBill } from "@/hooks/use-purchase-mutations";
import { useRowSelection } from "@/hooks/use-row-selection";
import { inr, fmtDate } from "@/lib/format";
import { ExportMenu } from "@/components/ui/export-menu";
import { BILL_STATUS_LABELS } from "@/lib/purchases";
import { PageHeader } from "@/components/ui/page-header";
import { NewButton } from "@/components/ui/new-button";
import { ListDateBar, useListDateFilter } from "@/components/ui/list-date-filter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function PurchaseBillsPage() {
  const { data: bills, isLoading } = usePurchaseBills();
  const dated = useListDateFilter(bills, (x) => x.billDate, "all");
  const { data: vendors } = useVendors();
  const { data: user } = useCurrentUser();
  const deleteBill = useDeleteBill();
  const canManage = !!user?.perms.managePurchases;

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [search, setSearch] = useState("");

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);
  const totalPayable = useMemo(() => (bills || []).reduce((s, b) => s + b.balance, 0), [bills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dated.rows;
    return dated.rows.filter((b) => b.billNumber.toLowerCase().includes(q) || (vendorNameById.get(b.vendorId) || "").toLowerCase().includes(q));
  }, [dated.rows, vendorNameById, search]);

  const selection = useRowSelection(filtered.map((b) => b.id));
  const selectedBills = filtered.filter((b) => selection.selected.has(b.id));

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

  const columns: DataTableColumn<PurchaseBillWithBalance>[] = [
    {
      key: "vendor",
      header: "Vendor name",
      alwaysVisible: true,
      sortValue: (b) => (vendorNameById.get(b.vendorId) || "").toLowerCase(),
      render: (b) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{vendorNameById.get(b.vendorId) || "Unknown vendor"}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{b.billNumber}</p>
        </div>
      ),
    },
    { key: "date", header: "Date", sortValue: (b) => b.billDate, render: (b) => fmtDate(b.billDate) },
    { key: "reference", header: "Reference number", sortValue: (b) => b.referenceNumber, render: (b) => b.referenceNumber || "—" },
    {
      key: "status",
      header: "Status",
      sortValue: (b) => b.paymentStatus,
      render: (b) => <Badge variant={b.paymentStatus === "paid" ? "secondary" : "outline"}>{BILL_STATUS_LABELS[b.paymentStatus]}</Badge>,
    },
    { key: "dueDate", header: "Due date", sortValue: (b) => b.dueDate || "", render: (b) => (b.dueDate ? fmtDate(b.dueDate) : "—") },
    { key: "amount", header: "Amount", align: "right", sortValue: (b) => b.total, render: (b) => inr(b.total) },
    {
      key: "balance",
      header: "Balance due",
      align: "right",
      sortValue: (b) => b.balance,
      render: (b) => <span className={b.balance > 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}>{inr(b.balance)}</span>,
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Bills"
        description={`${filtered.length} of ${bills?.length ?? 0} bills · ${inr(totalPayable)} total payable`}
        actions={
          canManage && (
            <NewButton href="/purchases/bills/new" ariaLabel="New bill" />
          )
        }
      />

      <ListDateBar dr={dated.dr} shown={dated.rows.length} total={bills?.length ?? 0} noun="bills" />

      {!isLoading && bills && bills.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" placeholder="Search bill number or vendor…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search bills" />
        </div>
      )}

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
          icon={ReceiptDuotoneIcon}
          title="No bills yet"
          description="Recording a bill is what actually receives stock into your raw materials inventory."
          action={
            canManage && (
              <NewButton href="/purchases/bills/new" ariaLabel="New bill" />
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ReceiptDuotoneIcon} title="No matching bills" description={`No bills found for "${search}".`} />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          getHref={(b) => `/purchases/bills/${b.id}`}
          storageKey="bills-table"
          selectedIds={canManage ? selection.selected : undefined}
          onToggleRow={canManage ? selection.toggle : undefined}
          onToggleAll={canManage ? selection.toggleAll : undefined}
        />
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
