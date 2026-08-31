"use client";

import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";
import { getNextStage, buildWhatsAppUrl, STAGE_META } from "@/lib/business-rules";
import { STAGE_STYLE } from "@/lib/design/stages";
import { resolveWaType } from "@/lib/wa-type";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";
import { inr, fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deliveryTarget, formatCountdownDHM, useCountdownNow } from "@/lib/delivery-countdown";
import { StageBadge, DueBadge } from "@/components/orders/stage-badge";
import { AlterationBadge, ReworkBadge, DeleteOrderButton } from "@/components/orders/order-card";
import { Button } from "@/components/ui/button";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Checkbox } from "@/components/ui/checkbox";
import { hapticTap } from "@/lib/haptics";
import type { useRowSelection } from "@/hooks/use-row-selection";
import type { Order } from "@/lib/types";
import type { Shop } from "@/lib/settings";
import type { OrderProfitBreakdown } from "@/lib/order-profit";

interface RowProps {
  order: Order;
  canChangeStage?: boolean;
  onAdvance?: (id: string) => void;
  advancing?: boolean;
  shop?: Shop;
  onRecordPayment?: (order: Order) => void;
  /** Resolves order.tailor (an employee id) to a display name — see orders/page.tsx. */
  tailorName?: (id: string) => string;
}

interface TableRowProps extends RowProps {
  isVisible?: (key: string) => boolean;
  selection?: ReturnType<typeof useRowSelection>;
  /** Only present when the viewer has viewReports — see orders/page.tsx. */
  profit?: OrderProfitBreakdown;
}

/** Live days:hours:minutes-remaining readout for orders still awaiting delivery — mirrors the
 * dashboard's "Delivery Countdown" widget, minus the seconds tick, since a list row doesn't need
 * per-second precision. Orders already delivered/paid have nothing left to count down to. */
function DeliveryCountdown({ order }: { order: Order }) {
  const now = useCountdownNow();
  if (!order.deliveryDate || order.status === "delivered" || order.status === "payment") return null;
  const { text, overdue } = formatCountdownDHM(deliveryTarget(order.deliveryDate, order.deliveryTime) - now);
  return (
    <p className="font-mono text-[11px] font-medium tabular-nums text-red-600 dark:text-red-400">
      {overdue && "−"}
      {text}
    </p>
  );
}

function AdvanceButton({ order, onAdvance, advancing, compact }: RowProps & { compact?: boolean }) {
  const next = getNextStage(order.status);
  if (!next) return null;
  const style = STAGE_STYLE[next];
  return (
    <Button
      size="sm"
      className={cn("h-9 px-2.5 text-xs sm:h-8", style.solid, compact && "min-w-0 flex-1")}
      disabled={advancing}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        hapticTap();
        onAdvance?.(order.id);
      }}
    >
      {/* min-w-0/truncate here (rather than the old blanket whitespace-nowrap) matters only for
          the compact card row, where this button shares a fixed-width row with two icon buttons
          — a long stage name (e.g. "Move to Delivered") could otherwise force the row wider than
          the card instead of just ellipsizing. The non-compact table-row usage has room to spare. */}
      <span className={compact ? "truncate" : "whitespace-nowrap"}>{advancing ? "…" : `Move to ${STAGE_META[next].label}`}</span>
    </Button>
  );
}

function OrderWhatsAppButton({ order, shop, compact }: { order: Order; shop?: Shop; compact?: boolean }) {
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);
  return (
    <WhatsAppIconButton
      href={buildWhatsAppUrl(order, resolveWaType(order), shop, waTemplates)}
      label={`WhatsApp ${order.name}`}
      className={cn("size-9", !compact && "sm:size-8")}
    />
  );
}

/** Balance-due orders get a one-tap payment-reminder WhatsApp link next to the plain WhatsApp
 *  button, so staff don't have to open the order just to nudge a customer for the balance. */
function PaymentReminderButton({ order, shop, compact }: { order: Order; shop?: Shop; compact?: boolean }) {
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);
  if (order.balance <= 0) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("h-9 shrink-0 gap-1.5 px-2.5 text-xs", !compact && "sm:h-8")}
      aria-label={`Payment reminder to ${order.name}`}
      title="Payment reminder"
      nativeButton={false}
      render={<a href={buildWhatsAppUrl(order, "paymentDue", shop, waTemplates)} target="_blank" rel="noopener noreferrer" />}
    >
      <WhatsAppIcon className="size-3.5 text-[#25D366]" /> Reminder
    </Button>
  );
}

function RecordPaymentButton({ order, onRecordPayment, compact }: { order: Order; onRecordPayment?: (order: Order) => void; compact?: boolean }) {
  if (!onRecordPayment || order.balance <= 0) return null;
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={cn("size-9 shrink-0", !compact && "sm:size-8")}
      aria-label={`Record payment for ${order.name}`}
      title="Record payment"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRecordPayment(order);
      }}
    >
      <Wallet className="size-4" />
    </Button>
  );
}

/**
 * Mobile order card. Tables force horizontal scrolling on phones, so below `md`
 * every order becomes a tap-friendly card with its actions inline.
 */
export function OrderCardRow(props: RowProps) {
  const { order, canChangeStage, shop, onRecordPayment, tailorName } = props;
  const style = STAGE_STYLE[order.status];

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Link href={`/orders/${order.id}`} className="block p-3.5 transition-colors active:bg-muted/50">
        <div className="flex items-start gap-3">
          <span className={cn("mt-1 h-9 w-1 shrink-0 rounded-full", style.accent)} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{order.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {order.id} · {order.mobile}
            </p>
          </div>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StageBadge stage={order.status} size="sm" />
          {order.orderType === "alteration" && <AlterationBadge />}
          {order.reworkFlag && <ReworkBadge />}
          <DueBadge order={order} />
          <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{inr(order.total)}</span>
        </div>

        <DeliveryCountdown order={order} />

        {order.tailor && (
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            Tailor: <span className="font-medium text-foreground">{tailorName?.(order.tailor) || order.tailor}</span>
          </p>
        )}

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{(order.garments || []).map((g) => g.type).join(", ") || "—"}</span>
          <span className="shrink-0 pl-2">
            <BalanceDue amount={order.balance} suffix=" due" />
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-2 border-t bg-muted/30 p-2">
        {canChangeStage && <AdvanceButton {...props} compact />}
        <RecordPaymentButton order={order} onRecordPayment={onRecordPayment} compact />
        <OrderWhatsAppButton order={order} shop={shop} compact />
        <PaymentReminderButton order={order} shop={shop} compact />
        <DeleteOrderButton order={order} compact />
      </div>
    </div>
  );
}

/** Desktop table row. */
export function OrderTableRow(props: TableRowProps) {
  const { order, canChangeStage, shop, onRecordPayment, selection, profit, tailorName } = props;
  const style = STAGE_STYLE[order.status];
  const isVisible = props.isVisible || (() => true);

  return (
    <tr className="border-b transition-colors last:border-0 hover:bg-muted/40">
      <td className="p-0">
        <div className={cn("h-full w-1", style.accent)} aria-hidden />
      </td>
      {selection && (
        <td className="px-3 py-3">
          <Checkbox
            checked={selection.selected.has(order.id)}
            onChange={() => selection.toggle(order.id)}
            aria-label={`Select order ${order.id}`}
          />
        </td>
      )}
      {isVisible("order") && (
        <td className="px-3 py-3">
          <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
            {order.id}
          </Link>
          <p className="text-xs text-muted-foreground">{fmtDateShort(order.inDate)}</p>
        </td>
      )}
      {isVisible("customer") && (
        <td className="px-3 py-3">
          <p className="truncate font-medium">{order.name}</p>
          <p className="truncate text-xs text-muted-foreground">{order.mobile}</p>
        </td>
      )}
      {isVisible("stage") && (
        <td className="px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <StageBadge stage={order.status} />
            {order.orderType === "alteration" && <AlterationBadge />}
            {order.reworkFlag && <ReworkBadge />}
          </div>
        </td>
      )}
      {isVisible("tailor") && (
        <td className="px-3 py-3">
          <span className="text-sm">{order.tailor ? tailorName?.(order.tailor) || order.tailor : "—"}</span>
        </td>
      )}
      {isVisible("delivery") && (
        <td className="px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm">{fmtDateShort(order.deliveryDate)}</span>
            <DueBadge order={order} />
          </div>
          <DeliveryCountdown order={order} />
        </td>
      )}
      {isVisible("total") && <td className="px-3 py-3 text-right tabular-nums">{inr(order.total)}</td>}
      {isVisible("balance") && (
        <td className="px-3 py-3 text-right tabular-nums">
          <BalanceDue amount={order.balance} paidLabel="Paid" />
        </td>
      )}
      {isVisible("profit") && profit && (
        <td className="px-3 py-3 text-right tabular-nums">
          <span className={cn("font-medium", profit.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{inr(profit.profit)}</span>
          {profit.tailorCostIsEstimate && <span className="ml-1 text-[10px] font-normal text-muted-foreground">Est.</span>}
        </td>
      )}
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1.5">
          {canChangeStage && <AdvanceButton {...props} />}
          <RecordPaymentButton order={order} onRecordPayment={onRecordPayment} />
          <OrderWhatsAppButton order={order} shop={shop} />
          <PaymentReminderButton order={order} shop={shop} />
          <DeleteOrderButton order={order} />
        </div>
      </td>
    </tr>
  );
}
