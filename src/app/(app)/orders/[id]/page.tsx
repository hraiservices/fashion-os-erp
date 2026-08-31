"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2, Wallet, ArrowRight, Phone, User, Clock, RotateCcw, Tag as TagIcon, TrendingUp, TrendingDown, Receipt } from "lucide-react";
import { useOrder } from "@/hooks/use-order";
import { useOrders } from "@/hooks/use-orders";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAdvanceStage, useDeleteOrder, useUpdateOrder, useSetOrderRework, useConfirmOrderPayables, useDeleteOrderPayment, useBackfillOrderPayment, useRenameOrder } from "@/hooks/use-order-mutations";
import { useOrderPayments } from "@/hooks/use-order-payments";
import { useTailorName } from "@/hooks/use-employees";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useOrderExpensesFor } from "@/hooks/use-order-expenses";
import { computeOrderProfit } from "@/lib/order-profit";
import { getNextStage, STAGE_META, LINING_LABELS, buildWhatsAppUrl, DEFAULT_TAILOR_RATES, isValidManualOrderNumber, type Lining, type TailorRateCard } from "@/lib/business-rules";
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
import { Input } from "@/components/ui/input";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);
  // Same list + ordering (newest-first by created_at) the notification bell and dashboard
  // widgets already query — reused here just to let the detail page step to the adjacent
  // order without forcing a round trip back through the list's own filters/search/sort.
  const { data: allOrders } = useOrders();
  const orderIndex = allOrders?.findIndex((o) => o.id === id) ?? -1;
  const prevOrderId = orderIndex > 0 ? allOrders?.[orderIndex - 1]?.id : undefined;
  const nextOrderId = orderIndex >= 0 && allOrders && orderIndex < allOrders.length - 1 ? allOrders[orderIndex + 1]?.id : undefined;
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const advanceStage = useAdvanceStage();
  const deleteOrder = useDeleteOrder();
  const renameOrder = useRenameOrder();
  const [renameOpen, setRenameOpen] = useState(false);
  const [newOrderNumber, setNewOrderNumber] = useState("");
  const renameError = newOrderNumber && !isValidManualOrderNumber(newOrderNumber.trim()) ? "Only letters, numbers, dots, dashes and underscores (no spaces or slashes)" : null;
  const updateOrder = useUpdateOrder();
  const setRework = useSetOrderRework();
  const confirmPayables = useConfirmOrderPayables();
  const tailorName = useTailorName();
  const { data: measureFields } = useMeasureFields();
  const { data: tailorRates } = useAppSetting<TailorRateCard>("tailorRates", DEFAULT_TAILOR_RATES);
  const { data: orderExpenses } = useOrderExpensesFor(id);
  const { data: orderPayments, isError: paymentsError } = useOrderPayments(id);
  const deletePayment = useDeleteOrderPayment();
  const backfillPayment = useBackfillOrderPayment();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reworkDialogOpen, setReworkDialogOpen] = useState(false);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  // The orders list page confirms every stage change before firing it (see handleAdvance there)
  // — this page's own "Move to" button skipped that dialog entirely and changed the stage
  // immediately on click, which is exactly the "confirmation pop-up doesn't show, stage just
  // changes" bug reported from here specifically.
  const [confirmAdvanceOpen, setConfirmAdvanceOpen] = useState(false);

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

  async function doBackfillPayment() {
    try {
      await backfillPayment.mutateAsync(id);
      toast.success("Payment record created — you can now delete it from here if needed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create payment record");
    }
  }

  async function doRename() {
    const trimmed = newOrderNumber.trim();
    if (!trimmed || !isValidManualOrderNumber(trimmed)) return;
    try {
      const res = await renameOrder.mutateAsync({ id, newId: trimmed });
      setRenameOpen(false);
      toast.success(`Order renamed to ${res.order.id}`);
      // The old id's page (this one) is gone the moment the rename lands — move on before the
      // user hits reload and gets a 404 for an id that no longer exists.
      router.replace(`/orders/${res.order.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename order");
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
  function requestAdvance() {
    if (next === "payment" && orderBalance > 0) {
      toast.error(`Clear balance of ${inr(orderBalance)} before marking as paid`);
      return;
    }
    setConfirmAdvanceOpen(true);
  }

  async function advance() {
    setConfirmAdvanceOpen(false);
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
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Orders
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-9 sm:size-8"
            aria-label="Previous order"
            title="Previous order"
            disabled={!prevOrderId}
            onClick={() => prevOrderId && router.push(`/orders/${prevOrderId}`)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-9 sm:size-8"
            aria-label="Next order"
            title="Next order"
            disabled={!nextOrderId}
            onClick={() => nextOrderId && router.push(`/orders/${nextOrderId}`)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className={cn("h-1", STAGE_STYLE[order.status].accent)} />
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">{order.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{order.id}</span>
                {user?.perms.deleteOrder && (
                  <Dialog
                    open={renameOpen}
                    onOpenChange={(open) => {
                      setRenameOpen(open);
                      if (open) setNewOrderNumber(order.id);
                    }}
                  >
                    <DialogTrigger
                      render={
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" aria-label="Change order number" title="Change order number">
                          <Pencil className="size-3.5" />
                        </button>
                      }
                    />
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Change order number</DialogTitle>
                        <DialogDescription>
                          This is the order&apos;s actual id — every payment, expense, log entry, and shared link that points at {order.id} will be repointed to the new number.
                        </DialogDescription>
                      </DialogHeader>
                      <Input
                        value={newOrderNumber}
                        onChange={(e) => setNewOrderNumber(e.target.value)}
                        placeholder="e.g. SOR-2026-0193"
                        autoFocus
                      />
                      {renameError && <p className="text-[11px] text-destructive">{renameError}</p>}
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setRenameOpen(false)} disabled={renameOrder.isPending}>
                          Cancel
                        </Button>
                        <Button
                          onClick={doRename}
                          disabled={renameOrder.isPending || !newOrderNumber.trim() || newOrderNumber.trim() === order.id || !!renameError}
                        >
                          {renameOrder.isPending ? "Renaming…" : "Rename"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
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

      {/* Actions — a plain wrapping/grid layout in normal document flow, not a fixed/sticky bar.
          A fixed bottom bar fought for the same screen corner as the app-wide WhatsApp-support/
          AI-Copilot bubbles (no amount of horizontal clearance fully avoided it) and forced a
          horizontally scrollable row to fit its buttons, which is worse than just wrapping them.
          The two primary actions (stage/payment) stay a prominent, naturally-sized row; the rest
          (up to 6: WhatsApp/edit/rework/payables/tag/print/delete) go in a 3-column grid on
          mobile so they fill the row evenly instead of wrapping into ragged, differently-sized
          groups — back to plain inline flex-wrap on desktop, where there's room to lay out
          naturally. */}
      <div className="space-y-2 print:hidden">
        <div className="flex flex-wrap gap-2">
          {user?.perms.changeStage && next && (
            <Button className={cn("h-12 flex-1 text-base sm:h-8 sm:flex-none sm:text-sm", STAGE_STYLE[next].solid)} disabled={advanceStage.isPending} onClick={requestAdvance}>
              <ArrowRight className="size-4" /> Move to {STAGE_META[next].label}
            </Button>
          )}
          {user?.perms.managePayments && order.balance > 0 && (
            <Button variant="outline" className="h-12 flex-1 text-base sm:h-8 sm:flex-none sm:text-sm" onClick={() => setPaymentOpen(true)}>
              <Wallet className="size-4" /> Collect payment
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          {order.balance > 0 ? (
            <WhatsAppButton
              href={paymentReminderUrl}
              label={
                <>
                  <span className="sm:hidden">Remind</span>
                  <span className="hidden sm:inline">Payment Reminder</span>
                </>
              }
              className="h-12 w-full justify-center sm:h-8 sm:w-auto sm:justify-start"
            />
          ) : (
            <WhatsAppButton href={waUrl} label="WhatsApp" className="h-12 w-full justify-center sm:h-8 sm:w-auto sm:justify-start" />
          )}
          {user?.perms.editOrder && (
            <Button variant="outline" className="h-12 w-full sm:h-8 sm:w-auto" nativeButton={false} render={<Link href={`/orders/${id}/edit`} />} aria-label="Edit order">
              <Pencil className="size-4" />
              <span>Edit</span>
            </Button>
          )}
          {user?.perms.changeStage && !order.reworkFlag && (
            <Button variant="outline" className="h-12 w-full sm:h-8 sm:w-auto" aria-label="Flag for rework" onClick={() => setReworkDialogOpen(true)}>
              <RotateCcw className="size-4" />
              <span>Rework</span>
            </Button>
          )}
          {user?.perms.managePayroll && order.readyAt && !order.payablesConfirmedAt && order.garments.some((g) => g.payableAmount) && (
            <Button
              variant="outline"
              className="h-12 w-full sm:h-8 sm:w-auto"
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
              <span className="sm:hidden">{confirmPayables.isPending ? "…" : "Confirm"}</span>
              <span className="hidden sm:inline lg:hidden">{confirmPayables.isPending ? "Confirming…" : "Confirm payables"}</span>
              <span className="hidden lg:inline">{confirmPayables.isPending ? "Confirming…" : "Confirm tailor payables"}</span>
            </Button>
          )}
          <Button variant="outline" className="h-12 w-full sm:h-8 sm:w-auto" aria-label="Print order tag" onClick={() => printOrderTag(order, shop, tailorName(order.tailor))}>
            <TagIcon className="size-4" />
            <span>Print tag</span>
          </Button>
          <PrintButton className="h-12 w-full justify-center sm:h-8 sm:w-auto sm:justify-start" />
          {user?.perms.deleteOrder && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" className="h-12 w-full sm:h-8 sm:w-auto" aria-label="Delete order">
                    <Trash2 className="size-4" />
                    <span>Delete</span>
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
      </div>

      <AlertDialog open={confirmAdvanceOpen} onOpenChange={setConfirmAdvanceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to {next ? STAGE_META[next].label : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Move <strong className="text-foreground">{orderName}</strong> ({order.id}) from{" "}
              <strong className="text-foreground">{STAGE_META[order.status].label}</strong> to{" "}
              <strong className="text-foreground">{next ? STAGE_META[next].label : ""}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={advanceStage.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={advance} disabled={advanceStage.isPending}>
              {advanceStage.isPending ? "Moving…" : "Move"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      {/* Visible to anyone who can delete orders, not just managePayments holders — the
          delete-order guard's own error message points here, so a deleteOrder-only account
          must be able to at least SEE what's blocking it, even if the per-row delete button
          below stays limited to managePayments (matching the API route's own gate). Previously
          gated on managePayments alone, which meant a deleteOrder-only account hit a dead end:
          told to come here, but this section didn't exist for them at all. */}
      {(user?.perms.managePayments || user?.perms.deleteOrder) && (
        <section className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Wallet className="size-4 text-muted-foreground" /> Payments
            </h2>
          </div>
          {paymentsError ? (
            // Never collapse a failed query into "no payments" — that made a real problem
            // (missing table / denied read) look like an empty, healthy order.
            <p className="px-4 py-6 text-center text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load payments for this order. The amount shown as paid above may not match what&apos;s recorded — please refresh, and report this if it persists.
            </p>
          ) : !orderPayments || orderPayments.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              <p>No payments recorded yet.</p>
              {order.advance > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-amber-600 dark:text-amber-400">
                    This order shows {inr(order.advance)} already paid, but has no payment record behind it — it was likely collected before payment tracking was added. Create the
                    missing record below (this won&apos;t change the balance, which is already correct) so it becomes visible in payment reports and deletable if you need to remove
                    this order.
                  </p>
                  {user?.perms.managePayments ? (
                    <Button variant="outline" size="sm" onClick={doBackfillPayment} disabled={backfillPayment.isPending}>
                      {backfillPayment.isPending ? "Creating…" : `Create payment record for ${inr(order.advance)}`}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Ask someone with payment permissions to create the missing record.</p>
                  )}
                </div>
              )}
            </div>
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
                  {user?.perms.managePayments && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete payment"
                      className="size-11 shrink-0 text-muted-foreground hover:text-red-600 sm:size-7"
                      onClick={() => setDeletePaymentId(p.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
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
