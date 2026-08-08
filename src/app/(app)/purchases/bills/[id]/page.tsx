"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Receipt, Wallet, Undo2, Trash2, Pencil } from "lucide-react";
import { usePurchaseBill } from "@/hooks/use-purchase-bills";
import { useVendor } from "@/hooks/use-vendors";
import { useVendorPaymentsForBill } from "@/hooks/use-vendor-payments";
import { useVendorCreditsForBill } from "@/hooks/use-vendor-credits";
import { useDeleteBill } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { BILL_STATUS_LABELS, purchaseItemName } from "@/lib/purchases";
import { GST_TYPE_LABELS } from "@/lib/gst";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaidAmount, BalanceDue } from "@/components/ui/money-text";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordVendorPaymentDialog } from "@/components/purchases/record-vendor-payment-dialog";
import { RaiseVendorCreditDialog } from "@/components/purchases/raise-vendor-credit-dialog";
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
import { useRouter } from "next/navigation";

export default function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: bill, isLoading } = usePurchaseBill(id);
  const { data: vendor } = useVendor(bill?.vendorId || "");
  const { data: payments } = useVendorPaymentsForBill(id);
  const { data: credits } = useVendorCreditsForBill(id);
  const { data: user } = useCurrentUser();
  const deleteBill = useDeleteBill();

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);

  const canManage = !!user?.perms.managePurchases;

  async function handleDelete() {
    if (!bill) return;
    try {
      await deleteBill.mutateAsync({ id: bill.id, billNumber: bill.billNumber, userEmail: user?.email });
      toast.success("Bill deleted — stock reverted");
      router.push("/purchases/bills");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete bill");
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

  if (!bill) {
    return (
      <div className="p-6">
        <EmptyState icon={Receipt} title="Bill not found" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/purchases/bills" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Bills
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{bill.billNumber}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {vendor?.name || "…"} · {fmtDate(bill.billDate)}
            {bill.dueDate && ` · Due ${fmtDate(bill.dueDate)}`}
          </p>
        </div>
        <Badge variant={bill.paymentStatus === "paid" ? "secondary" : "outline"}>{BILL_STATUS_LABELS[bill.paymentStatus]}</Badge>
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
                {bill.items.map((item, i) => (
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
                <tr className="border-t bg-muted/30">
                  <td className="p-2 text-muted-foreground" colSpan={3}>
                    Taxable amount
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(bill.taxableAmount)}</td>
                </tr>
                {bill.gstType !== "none" && (
                  <>
                    {bill.gstType === "intra" ? (
                      <>
                        <tr className="bg-muted/30">
                          <td className="p-2 text-muted-foreground" colSpan={3}>
                            CGST
                          </td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(bill.cgst)}</td>
                        </tr>
                        <tr className="bg-muted/30">
                          <td className="p-2 text-muted-foreground" colSpan={3}>
                            SGST
                          </td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(bill.sgst)}</td>
                        </tr>
                      </>
                    ) : (
                      <tr className="bg-muted/30">
                        <td className="p-2 text-muted-foreground" colSpan={3}>
                          IGST
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(bill.igst)}</td>
                      </tr>
                    )}
                  </>
                )}
                <tr className="border-t font-medium">
                  <td className="p-2" colSpan={3}>
                    Total ({GST_TYPE_LABELS[bill.gstType]})
                  </td>
                  <td className="p-2 text-right tabular-nums">{inr(bill.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {(payments?.length || 0) > 0 && (
            <section className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Payments ({payments?.length})</h2>
              </div>
              <ul className="divide-y">
                {payments?.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p>{p.method}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(p.date)}
                        {p.note && ` · ${p.note}`}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{inr(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(credits?.length || 0) > 0 && (
            <section className="rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Vendor credits ({credits?.length})</h2>
              </div>
              <ul className="divide-y">
                {credits?.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p>{c.creditNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(c.date)} · {c.reason}
                      </p>
                    </div>
                    <span className="font-medium tabular-nums text-red-600 dark:text-red-400">-{inr(c.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {bill.notes && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="mb-1 font-medium">Notes</p>
              {bill.notes}
            </div>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
              <div className="bg-card p-3 text-center">
                <p className="text-lg font-semibold tabular-nums">{inr(bill.total)}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
              </div>
              <div className="bg-card p-3 text-center">
                <PaidAmount amount={bill.paidTotal} className="text-lg" />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</p>
              </div>
              <div className="bg-card p-3 text-center">
                <BalanceDue amount={bill.balance} paidLabel={inr(bill.balance)} className="text-lg" />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</p>
              </div>
            </div>

            {canManage && (
              <>
                {bill.balance > 0 && (
                  <Button className="mt-4 w-full" onClick={() => setPaymentOpen(true)}>
                    <Wallet className="size-4" /> Record payment
                  </Button>
                )}

                <div className="mt-4 space-y-1.5">
                  <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Manage</p>
                  <Button variant="outline" className="w-full justify-start" nativeButton={false} render={<Link href={`/purchases/bills/${bill.id}/edit`} />}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => setCreditOpen(true)}>
                    <Undo2 className="size-4" /> Raise vendor credit
                  </Button>
                </div>

                <div className="mt-4 border-t pt-4">
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="destructive" className="w-full justify-start"><Trash2 className="size-4" /> Delete bill</Button>} />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {bill.billNumber}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This reverses the stock this bill added to raw materials, and cannot be undone.
                          {(payments?.length || 0) > 0 && " This bill has recorded payments — delete those first."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {canManage && (
        <>
          <RecordVendorPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} billId={bill.id} vendorId={bill.vendorId} billNumber={bill.billNumber} balance={bill.balance} />
          <RaiseVendorCreditDialog open={creditOpen} onOpenChange={setCreditOpen} vendorId={bill.vendorId} billId={bill.id} billNumber={bill.billNumber} />
        </>
      )}
    </div>
  );
}
