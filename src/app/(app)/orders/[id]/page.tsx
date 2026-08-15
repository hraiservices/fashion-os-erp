"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2, Wallet, ArrowRight, Phone, User, Clock } from "lucide-react";
import { useOrder } from "@/hooks/use-order";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAdvanceStage, useDeleteOrder } from "@/hooks/use-order-mutations";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { getNextStage, STAGE_META, LINING_LABELS, buildWhatsAppUrl, type Lining } from "@/lib/business-rules";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { PrintButton } from "@/components/ui/print-button";
import { Skeleton } from "@/components/ui/skeleton";
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
  const { data: measureFields } = useMeasureFields();
  const [paymentOpen, setPaymentOpen] = useState(false);

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
            </div>
          </div>

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
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{g.type}</p>
                <p className="text-xs text-muted-foreground">
                  {LINING_LABELS[g.lining as Lining] ?? g.lining} · qty {g.no || 1}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{inr((g.amount || 0) * (g.no || 1))}</span>
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t px-4 py-3 text-sm sm:grid-cols-3">
          <Detail icon={Clock} label="Order date" value={order.inTime ? `${fmtDate(order.inDate)} ${order.inTime}` : fmtDate(order.inDate)} />
          <Detail icon={Clock} label="Delivery" value={order.deliveryTime ? `${fmtDate(order.deliveryDate)} ${order.deliveryTime}` : fmtDate(order.deliveryDate)} />
          <Detail icon={User} label="Tailor" value={order.tailor || "—"} />
        </dl>
        {order.special && (
          <div className="border-t px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Special instructions</p>
            <p className="mt-1 text-sm">{order.special}</p>
          </div>
        )}
      </section>

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
