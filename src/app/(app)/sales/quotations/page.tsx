"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Ban, ChevronRight } from "lucide-react";
import { FileTextDuotoneIcon } from "@/components/icons/duotone-icons";
import { useSalesQuotations } from "@/hooks/use-sales-quotations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSetQuotationStatus } from "@/hooks/use-sales-mutations";
import { useRowSelection } from "@/hooks/use-row-selection";
import { inr, fmtDate } from "@/lib/format";
import { QUOTE_STATUS_LABELS } from "@/lib/sales";
import { PageHeader } from "@/components/ui/page-header";
import { NewButton } from "@/components/ui/new-button";
import { ListDateBar, useListDateFilter } from "@/components/ui/list-date-filter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function QuotationsPage() {
  const { data: quotes, isLoading } = useSalesQuotations();
  const dated = useListDateFilter(quotes, (x) => x.date, "all");
  const { data: user } = useCurrentUser();
  const setStatus = useSetQuotationStatus();
  const canManage = !!user?.perms.manageSales;
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const selection = useRowSelection(dated.rows.map((q) => q.id));
  const selectedQuotes = dated.rows.filter((q) => selection.selected.has(q.id) && q.status !== "cancelled");

  async function bulkCancel() {
    setBulkBusy(true);
    setBulkCancelOpen(false);
    let failed = 0;
    for (const q of selectedQuotes) {
      try {
        await setStatus.mutateAsync({ id: q.id, quoteNumber: q.quoteNumber, status: "cancelled", userEmail: user?.email });
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    selection.clear();
    if (failed) toast.error(`${selectedQuotes.length - failed} cancelled, ${failed} failed`);
    else toast.success(`${selectedQuotes.length} quotation(s) cancelled`);
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Quotations"
        description={`${quotes?.length ?? 0} quotations`}
        actions={
          canManage && (
            <NewButton href="/sales/quotations/new" ariaLabel="New quotation" />
          )
        }
      />

      <ListDateBar dr={dated.dr} shown={dated.rows.length} total={quotes?.length ?? 0} noun="quotations" />

      {canManage && !isLoading && selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selection.count} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" className="h-11 px-4 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={() => setBulkCancelOpen(true)} disabled={bulkBusy || selectedQuotes.length === 0}>
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
      ) : !quotes || quotes.length === 0 ? (
        <EmptyState
          icon={FileTextDuotoneIcon}
          title="No quotations yet"
          description="Create a quotation to send a price estimate before converting it to an invoice."
          action={
            canManage && (
              <NewButton href="/sales/quotations/new" ariaLabel="New quotation" />
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {canManage && dated.rows.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox checked={selection.allSelected} onChange={selection.toggleAll} aria-label="Select all quotations" />
              Select all
            </label>
          )}
          {dated.rows.map((q) => (
            <div key={q.id} className="flex items-center gap-2 rounded-xl border bg-card p-3 hover:bg-muted/40">
              {canManage && <Checkbox checked={selection.selected.has(q.id)} onChange={() => selection.toggle(q.id)} aria-label={`Select ${q.quoteNumber}`} />}
              <Link href={`/sales/quotations/${q.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{q.quoteNumber}</span>
                    <Badge variant="outline">{QUOTE_STATUS_LABELS[q.status]}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {q.customerName} · {fmtDate(q.date)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(q.total)}</p>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {selectedQuotes.length} quotation(s)?</AlertDialogTitle>
            <AlertDialogDescription>This marks them as cancelled. Already-cancelled ones in your selection are skipped.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={bulkCancel}>Cancel quotations</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
