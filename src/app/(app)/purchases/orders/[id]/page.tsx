"use client";

import { use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, FileText, Receipt, Ban, Pencil } from "lucide-react";
import { usePurchaseOrder } from "@/hooks/use-purchase-orders";
import { useVendor } from "@/hooks/use-vendors";
import { useCancelPurchaseOrder } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { PO_STATUS_LABELS, purchaseItemName } from "@/lib/purchases";
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

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: po, isLoading } = usePurchaseOrder(id);
  const { data: vendor } = useVendor(po?.vendorId || "");
  const { data: user } = useCurrentUser();
  const cancelPo = useCancelPurchaseOrder();

  const canManage = !!user?.perms.managePurchases;

  async function handleCancel() {
    if (!po) return;
    try {
      await cancelPo.mutateAsync({ id: po.id, poNumber: po.poNumber, userEmail: user?.email });
      toast.success("Purchase order cancelled");
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

  if (!po) {
    return (
      <div className="p-6">
        <EmptyState icon={FileText} title="Purchase order not found" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/purchases/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Purchase Orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{po.poNumber}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {vendor?.name || "…"} · {fmtDate(po.date)}
          </p>
        </div>
        <Badge variant="outline">{PO_STATUS_LABELS[po.status]}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-2 text-left font-medium">Item</th>
                  <th className="p-2 text-right font-medium">Qty</th>
                  <th className="p-2 text-right font-medium">Cost/unit</th>
                  <th className="p-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {po.items.map((item, i) => (
                  <tr key={i}>
                    <td className="p-2">{purchaseItemName(item)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {item.qty} {item.unitName}
                    </td>
                    <td className="p-2 text-right tabular-nums">{inr(item.unitCost)}</td>
                    <td className="p-2 text-right tabular-nums">{inr(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="p-2" colSpan={3}>
                    Total
                  </td>
                  <td className="p-2 text-right tabular-nums">{inr(po.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {po.notes && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="mb-1 font-medium">Notes</p>
              {po.notes}
            </div>
          )}
        </div>

        {canManage && po.status !== "cancelled" && po.status !== "received" && (
          <div className="space-y-4 lg:sticky lg:top-4">
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <p className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actions</p>
              <div className="space-y-1.5">
                <Button className="w-full justify-start" nativeButton={false} render={<Link href={`/purchases/bills/new?poId=${po.id}`} />}>
                  <Receipt className="size-4" /> Create bill from this PO
                </Button>
                <Button variant="outline" className="w-full justify-start" nativeButton={false} render={<Link href={`/purchases/orders/${po.id}/edit`} />}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="outline" className="w-full justify-start"><Ban className="size-4" /> Cancel PO</Button>} />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel {po.poNumber}?</AlertDialogTitle>
                      <AlertDialogDescription>This marks the purchase order as cancelled. It has no effect on stock since POs don't move inventory.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCancel}>Cancel PO</AlertDialogAction>
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
