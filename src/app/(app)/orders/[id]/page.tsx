"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2, Wallet, ArrowRight, Phone, User, Clock, RotateCcw, Tag as TagIcon, TrendingUp, TrendingDown, Receipt } from "lucide-react";
import { useOrder } from "@/hooks/use-order";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAdvanceStage, useDeleteOrder, useUpdateOrder, useSetOrderRework, useConfirmOrderPayables, useDeleteOrderPayment } from "@/hooks/use-order-mutations";
import { useOrderPayments } from "@/hooks/use-order-payments";
import { useTailorName } from "@/hooks/use-employees";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useOrderExpensesFor } from "@/hooks/use-order-expenses";
import { computeOrderProfit } from "@/lib/order-profit";
import { getNextStage, STAGE_META, LINING_LABELS, buildWhatsAppUrl, DEFAULT_TAILOR_RATES, type Lining, type TailorRateCard } from "@/lib/business-rules";
import { STAGE_STYLE } from "@/lib/design/stages";
import { resolveWaType } from "@/lib/wa-type";
import { inr, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hasMeasurements, hydrateMeasurements } from "@/lib/measurements";
import { useMeasureFields } from "@/hooks/use-measure-fields";
import { MeasurementView } from "@/components/measurements/measurement-grid";
import { OrderAttachments } from "@/components/orders/order-attachments";
import { StageBadge, DueBadge } from "@/components/orders/stage-badge";
import { PaymentModal } from "@/components/orders/payment-modal";
import { GarmentChecklistRow } from "@/components/orders/garment-checklist";
import { ReworkDialog } from "@/components/orders/rework-dialog";
import { printOrderTag } from "@/lib/order-tag";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { PrintButton } from "@/components/ui/print-button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Garment } from "@/lib/types";
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

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const advanceStage = useAdvanceStage();
  const deleteOrder = useDeleteOrder();
  const updateOrder = useUpdateOrder();
  const setRework = useSetOrderRework();
  const confirmPayables = useConfirmOrderPayables();
  const tailorName = useTailorName();
  const { data: measureFields } = useMeasureFields();
  const { data: tailorRates } = useAppSetting<TailorRateCard>("tailorRates", DEFAULT_TAILOR_RATES);
  const { data: orderExpenses } = useOrderExpensesFor(id);
  const { data: orderPayments } = useOrderPayments(id);
  const deletePayment = useDeleteOrderPayment();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);

  async function doDeletePayment() {
    if (!deletePaymentId) return;
    try {
      await deletePayment.mutateAsync({ orderId: id, paymentId: deletePaymentId });
      toast.success("Payment deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete payment");
    } finally {
      setDeletePaymentId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!order) {
    return (
      <div className="p-6">
        <EmptyState icon={ArrowLeft} title="Order not found" action={<Button nativeButton={false} render={<Link href="/orders" />}>Back to orders</Button>} />
      </div>
    );
  }

  const next = getNextStage(order.status);
  const orderName = order.name;
  const waUrl = buildWhatsAppUrl(order, resolveWaType(order), shop);
  const paymentReminderUrl = buildWhatsAppUrl(order, "paymentDue", shop);
  const paidPct = order.total > 0 ? Math.round((order.advance / order.total) * 100) : 0;

  const orderBalance = order.balance;
  const profit = computeOrderProfit(order, tailorRates || DEFAULT_TAILOR_RATES, orderExpenses || []);
  async function advance() {
    if (next === "payment" && orderBalance > 0) {
      toast.error(`Clear balance of ${inr(orderBalance)} before marking as paid`);
      return;
    }
    try {
      const res = await advanceStage.mutateAsync(id);
      const s = res.order.status;
      toast.success(s === "ready" ? "Marked ready for pickup" : s === "payment" ? "Marked as paid" : "Stage updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to advance stage");
    }
  }

  async function doDelete() {
    try {
      await deleteOrder.mutateAsync({ id, name: orderName, userEmail: user?.email });
      toast.success("Order deleted");
      router.push("/orders");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete order");
    }
  }

  async function handleGarmentsChange(next: Garment[]) {
    try {
      await updateOrder.mutateAsync({ id, patch: { garments: next }, userEmail: user?.email });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update checklist");
    }
  }

  async function clearRework() {
    try {
      await setRework.mutateAsync({ orderId: id, flag: false });
      toast.success("Rework flag cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear rework flag");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-36 sm:p-6 sm:pb-36 lg:pb-6">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Orders
      </Link>

      {/* Header */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className={cn("h-1", STAGE_STYLE[order.status].accent)} />
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">{order.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{order.id}</span>
                <a href={`tel:${order.mobile}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="size-3.5" /> {order.mobile}
                </a>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <StageBadge stage={order.status} />
              <DueBadge order={order} />
              {order.reworkFlag && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
                  <RotateCcw className="size-3" /> Rework
                </span>
              )}
            </div>
          </div>

          {order.reworkFlag && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-50 p-3 text-sm dark:bg-red-950/40">
              <p className="font-medium text-red-700 dark:text-red-400">Flagged for rework</p>
              <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-400/80">{order.reworkReason}</p>
              {user?.perms.changeStage && (
                <Button variant="outline" size="sm" className="mt-2" disabled={setRework.isPending} onClick={clearRework}>
                  Clear rework flag
                </Button>
              )}
            </div>
          )}

          {/* Payment progress — the number the shop cares about most */}
          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Balance due</span>
              <BalanceDue amount={order.balance} paidLabel="Paid in full" className="text-xl" />
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, paidPct)}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Paid {inr(order.advance)}</span>
              <span>Total {inr(order.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions — sticky on mobile so the primary action is always thumb-reachable */}
      <div className="fixed inset-x-0 bottom-16 z-30 flex gap-2 border-t bg-background/95 p-3 backdrop-blur print:hidden lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        {user?.perms.changeStage && next && (
          <Button className={cn("flex-1 lg:flex-none", STAGE_STYLE[next].solid)} disabled={advanceStage.isPending} onClick={advance}>
            <ArrowRight className="size-4" /> Move to {STAGE_META[next].label}
          </Button>
        )}
        {user?.perms.managePayments && order.balance > 0 && (
          <Button variant="outline" className="flex-1 lg:flex-none" onClick={() => setPaymentOpen(true)}>
            <Wallet className="size-4" /> Collect payment
          </Button>
        )}
        {order.balance > 0 ? (
          <WhatsAppButton href={paymentReminderUrl} label="Payment Reminder" labelClassName="hidden lg:inline" />
        ) : (
          <WhatsAppButton href={waUrl} label="WhatsApp" labelClassName="hidden lg:inline" />
        )}
        {user?.perms.editOrder && (
          <Button variant="outline" nativeButton={false} render={<Link href={`/orders/${id}/edit`} />} aria-label="Edit order">
            <Pencil className="size-4" />
            <span className="hidden lg:inline">Edit</span>
          </Button>
        )}
        {user?.perms.changeStage && !order.reworkFlag && (
          <Button variant="outline" aria-label="Flag for rework" onClick={() => setReworkDialogOpen(true)}>
            <RotateCcw className="size-4" />
            <span className="hidden lg:inline">Rework</span>
          </Button>
        )}
        {user?.perms.managePayroll && order.readyAt && !order.payablesConfirmedAt && order.garments.some((g) => g.payableAmount) && (
          <Button
            variant="outline"
            aria-label="Confirm tailor payables"
            disabled={confirmPayables.isPending}
            onClick={async () => {
              try {
                await confirmPayables.mutateAsync(id);
                toast.success("Tailor payables confirmed");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to confirm payables");
              }
            }}
          >
            <Wallet className="size-4" />
            <span className="hidden lg:inline">{confirmPayables.isPending ? "Confirming…" : "Confirm tailor payables"}</span>
          </Button>
        )}
        <Button variant="outline" aria-label="Print order tag" onClick={() => printOrderTag(order, shop, tailorName(order.tailor))}>
          <TagIcon className="size-4" />
          <span className="hidden lg:inline">Print tag</span>
        </Button>
        <PrintButton labelClassName="hidden lg:inline" />
        {user?.perms.deleteOrder && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" aria-label="Delete order">
                  <Trash2 className="size-4" />
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this order?</AlertDialogTitle>
                <AlertDialogDescription>
                  {order.id} for {order.name} will be permanently removed. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteOrder.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={doDelete} disabled={deleteOrder.isPending}>
                  {deleteOrder.isPending ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Garments */}
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Garments</h2>
        </div>
        <ul className="divide-y">
          {order.garments.map((g, i) => (
            <li key={i} className="space-y-2 px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{g.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {LINING_LABELS[g.lining as Lining] ?? g.lining} · qty {g.no || 1}
                    {g.tailor && ` · ${tailorName(g.tailor)}`}
                    {g.payableAmount != null && ` · payable ${inr(g.payableAmount)}`}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{inr((g.amount || 0) * (g.no || 1))}</span>
              </div>
              <GarmentChecklistRow
                garment={g}
                index={i}
                garments={order.garments}
                onChange={handleGarmentsChange}
                disabled={!user?.perms.changeStage || updateOrder.isPending}
              />
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t px-4 py-3 text-sm sm:grid-cols-3">
          <Detail icon={Clock} label="Order date" value={order.inTime ? `${fmtDate(order.inDate)} ${order.inTime}` : fmtDate(order.inDate)} />
          <Detail icon={Clock} label="Delivery" value={order.deliveryTime ? `${fmtDate(order.deliveryDate)} ${order.deliveryTime}` : fmtDate(order.deliveryDate)} />
          <Detail icon={User} label="Tailor" value={order.tailor ? tailorName(order.tailor) : "—"} />
          {order.bookingSource && <Detail icon={User} label="Booking source" value={order.bookingSource} />}
        </dl>
        {order.special && (
          <div className="border-t px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Special instructions</p>
            <p className="mt-1 text-sm">{order.special}</p>
          </div>
        )}
      </section>

      {/* Payments — itemized ledger; deleting a row reverses the order's advance/balance
          (and any redeemed loyalty points) via delete_order_payment(). */}
      {user?.perms.managePayments && (
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Wallet className="size-4 text-muted-foreground" /> Payments
            </h2>
          </div>
          {!orderPayments || orderPayments.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {orderPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {inr(p.amount)}
                      {p.ptDiscount > 0 && <span className="text-muted-foreground"> + {inr(p.ptDiscount)} pts</span>}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">via {p.method}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDate(p.createdAt)}
                      {p.note ? ` — ${p.note}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete payment"
                    className="shrink-0 text-muted-foreground hover:text-red-600"
                    onClick={() => setDeletePaymentId(p.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Profitability — internal only, same viewReports gate as the order form's Costs section */}
      {user?.perms.viewReports && (
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Receipt className="size-4 text-muted-foreground" /> Profitability
            </h2>
          </div>
          <div className="space-y-1.5 px-4 py-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Order value</span>
              <span className="tabular-nums">{inr(profit.revenue)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tailor cost{profit.tailorCostIsEstimate ? " (estimated)" : ""}</span>
              <span className="tabular-nums">−{inr(profit.tailorCost)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Stitching expenses</span>
              <span className="tabular-nums">−{inr(profit.stitchingExpenses)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Fabric + other cost</span>
              <span className="tabular-nums">−{inr(profit.fabricCost + profit.otherCost)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
              <span className="flex items-center gap-1.5">
                {profit.profit >= 0 ? <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" /> : <TrendingDown className="size-4 text-red-600 dark:text-red-400" />}
                {profit.tailorCostIsEstimate ? "Estimated profit margin" : "Profit margin"}
              </span>
              <span className={cn("tabular-nums", profit.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                {inr(profit.profit)}
                {profit.marginPct != null && <span className="ml-1 text-xs font-normal text-muted-foreground">({profit.marginPct}%)</span>}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Measurements */}
      {hasMeasurements(order.measurements) && (
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Measurements</h2>
          </div>
          <div className="p-4">
            <MeasurementView fields={measureFields || []} values={hydrateMeasurements(measureFields || [], order.measurements)} />
          </div>
        </section>
      )}

      {/* Attachments */}
      <OrderAttachments images={order.images} audios={order.audios} videos={order.videos} />

      {/* History */}
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">History</h2>
        </div>
        {order.history.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ol className="max-h-72 divide-y overflow-y-auto">
            {order.history.map((h, i) => (
              <li key={i} className="px-4 py-2.5 text-sm text-muted-foreground">
                {h}
              </li>
            ))}
          </ol>
        )}
      </section>

      <PaymentModal order={order} open={paymentOpen} onOpenChange={setPaymentOpen} />
      <ReworkDialog orderId={id} open={reworkDialogOpen} onOpenChange={setReworkDialogOpen} />

      <AlertDialog open={!!deletePaymentId} onOpenChange={(v) => !v && setDeletePaymentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The order&apos;s advance/balance will be recalculated, and any loyalty points redeemed as part of it will be refunded to the customer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDeletePayment}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3" /> {label}
      </dt>
      <dd className="mt-0.5 truncate font-medium">{value}</dd>
    </div>
  );
}
