"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Wallet, Trash2 } from "lucide-react";
import { useAllSalesPayments } from "@/hooks/use-sales-payments";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useDeleteSalesPayment, useBulkDeleteSalesPayments } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRowSelection } from "@/hooks/use-row-selection";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";

export default function SalesPaymentsPage() {
  const { data: payments, isLoading: loadingPayments } = useAllSalesPayments();
  const { data: invoices, isLoading: loadingInvoices } = useSalesInvoices();
  const { data: user } = useCurrentUser();
  const deletePayment = useDeleteSalesPayment();
  const bulkDelete = useBulkDeleteSalesPayments();
  const isLoading = loadingPayments || loadingInvoices;
  const [search, setSearch] = useState("");
  const [confirmOne, setConfirmOne] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);

  const canManage = user?.perms.managePayments;
  const invoiceById = useMemo(() => new Map((invoices || []).map((i) => [i.id, i])), [invoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (payments || []).filter((p) => {
      if (!q) return true;
      const inv = invoiceById.get(p.invoiceId);
      return (inv?.invoiceNumber || "").toLowerCase().includes(q) || (inv?.customerName || "").toLowerCase().includes(q) || p.customerMobile.includes(q);
    });
  }, [payments, search, invoiceById]);

  const total = useMemo(() => filtered.reduce((s, p) => s + p.amount, 0), [filtered]);
  const selection = useRowSelection(filtered.map((p) => p.id));
  const paymentById = useMemo(() => new Map((payments || []).map((p) => [p.id, p])), [payments]);

  async function doDeleteOne(id: string) {
    const p = paymentById.get(id);
    if (!p) return;
    setBusy(true);
    try {
      await deletePayment.mutateAsync({ id, amount: p.amount, invoiceNumber: invoiceById.get(p.invoiceId)?.invoiceNumber || "", userEmail: user?.email });
      toast.success("Payment deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete payment");
    } finally {
      setBusy(false);
      setConfirmOne(null);
    }
  }

  async function doDeleteBulk() {
    const ids = Array.from(selection.selected);
    setBusy(true);
    try {
      await bulkDelete.mutateAsync({ ids, userEmail: user?.email });
      toast.success(`${ids.length} payment(s) deleted`);
      selection.clear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete payments");
    } finally {
      setBusy(false);
      setConfirmBulk(false);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Payments Received" description={`${filtered.length} payments · ${inr(total)} total`} />

      <div className="relative sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search invoice#, customer, mobile…" className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {canManage && selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selection.count} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" onClick={() => setConfirmBulk(true)} disabled={busy}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={selection.clear} disabled={busy}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Wallet} title="No payments recorded yet" description="Payments recorded against any sales invoice will appear here." />
      ) : (
        <div className="hidden overflow-hidden rounded-xl border sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                {canManage && (
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      checked={selection.allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selection.someSelected;
                      }}
                      onChange={selection.toggleAll}
                      aria-label="Select all payments"
                    />
                  </TableHead>
                )}
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Invoice#</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Note</TableHead>
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const inv = invoiceById.get(p.invoiceId);
                return (
                  <TableRow key={p.id}>
                    {canManage && (
                      <TableCell>
                        <input type="checkbox" checked={selection.selected.has(p.id)} onChange={() => selection.toggle(p.id)} aria-label={`Select payment of ${inr(p.amount)}`} />
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">{fmtDate(p.date)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{inv?.customerName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{p.customerMobile}</p>
                    </TableCell>
                    <TableCell>
                      {inv ? (
                        <Link href={`/sales/invoices/${inv.id}`} className="font-medium text-primary hover:underline">
                          {inv.invoiceNumber}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.method}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{inr(p.amount)}</TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">{p.note || "—"}</TableCell>
                    {canManage && (
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" className="size-11 text-muted-foreground hover:text-destructive sm:size-7" onClick={() => setConfirmOne(p.id)} aria-label="Delete payment">
                          <Trash2 className="size-3.5" />
                        </Button>
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
            const inv = invoiceById.get(p.invoiceId);
            return (
              <MobileRecordCard key={p.id} href={inv ? `/sales/invoices/${inv.id}` : undefined}>
                <MobileRecordHeader
                  title={inv?.customerName || "—"}
                  subtitle={p.customerMobile}
                  value={inr(p.amount)}
                  valueClassName="text-emerald-600 dark:text-emerald-400"
                  showChevron={!!inv}
                />
                <MobileRecordRow label="Invoice#" value={inv ? inv.invoiceNumber : "—"} />
                <MobileRecordRow label="Date" value={fmtDate(p.date)} />
                <MobileRecordRow label="Mode" value={p.method} />
                <MobileRecordRow label="Note" value={p.note || "—"} />
              </MobileRecordCard>
            );
          })}
        </MobileRecordList>
      )}

      <AlertDialog open={!!confirmOne} onOpenChange={(v) => !v && setConfirmOne(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The invoice&apos;s balance will go back up by the payment amount.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmOne && doDeleteOne(confirmOne)} disabled={busy}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} payment(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Each affected invoice&apos;s balance will go back up by its payment amount.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteBulk} disabled={busy}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
