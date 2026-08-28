"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, FileText, Receipt, Ban, Pencil } from "lucide-react";
import { useSalesQuotation } from "@/hooks/use-sales-quotations";
import { useSetQuotationStatus } from "@/hooks/use-sales-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { QUOTE_STATUS_LABELS } from "@/lib/sales";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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

export default function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: quote, isLoading } = useSalesQuotation(id);
  const { data: user } = useCurrentUser();
  const setStatus = useSetQuotationStatus();

  const canManage = !!user?.perms.manageSales;

  async function handleCancel() {
    if (!quote) return;
    try {
      await setStatus.mutateAsync({ id: quote.id, quoteNumber: quote.quoteNumber, status: "cancelled", userEmail: user?.email });
      toast.success("Quotation cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel");
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-2" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-6">
        <EmptyState icon={FileText} title="Quotation not found" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/sales/quotations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Quotations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{quote.quoteNumber}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {quote.customerName} · {fmtDate(quote.date)}
            {quote.validUntil && ` · Valid until ${fmtDate(quote.validUntil)}`}
          </p>
        </div>
        <Badge variant="outline">{QUOTE_STATUS_LABELS[quote.status]}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-2 text-left font-medium">Product</th>
                  <th className="p-2 text-right font-medium">Qty</th>
                  <th className="p-2 text-right font-medium">Price</th>
                  <th className="p-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quote.items.map((item, i) => (
                  <tr key={i}>
                    <td className="p-2">{item.productName}</td>
                    <td className="p-2 text-right tabular-nums">{item.qty}</td>
                    <td className="p-2 text-right tabular-nums">{inr(item.unitPrice)}</td>
                    <td className="p-2 text-right tabular-nums">{inr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="p-2" colSpan={3}>
                    Total
                  </td>
                  <td className="p-2 text-right tabular-nums">{inr(quote.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {quote.notes && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="mb-1 font-medium">Notes</p>
              {quote.notes}
            </div>
          )}
        </div>

        {canManage && quote.status !== "cancelled" && (
          <div className="space-y-4 lg:sticky lg:top-4">
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <p className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actions</p>
              <div className="space-y-1.5">
                <Button className="w-full justify-start" nativeButton={false} render={<Link href={`/sales/invoices/new?quoteId=${quote.id}`} />}>
                  <Receipt className="size-4" /> Convert to invoice
                </Button>
                <Button variant="outline" className="w-full justify-start" nativeButton={false} render={<Link href={`/sales/quotations/${quote.id}/edit`} />}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="outline" className="w-full justify-start"><Ban className="size-4" /> Cancel</Button>} />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel {quote.quoteNumber}?</AlertDialogTitle>
                      <AlertDialogDescription>This marks the quotation as cancelled. It has no stock impact since quotations don&apos;t move inventory.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCancel}>Cancel quotation</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
