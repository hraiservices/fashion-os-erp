"use client";

import Link from "next/link";
import { Wallet, RotateCcw } from "lucide-react";
import { getNextStage, buildWhatsAppUrl, STAGE_META } from "@/lib/business-rules";
import { STAGE_STYLE } from "@/lib/design/stages";
import { resolveWaType } from "@/lib/wa-type";
import { inr, fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { orderChecklistProgress } from "@/lib/garment-checklist";
import { DueBadge } from "@/components/orders/stage-badge";
import { Button } from "@/components/ui/button";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import type { Order } from "@/lib/types";
import type { Shop } from "@/lib/settings";

export function AlterationBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-violet-500/30 bg-violet-50 px-1.5 py-0 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
      Alteration
    </span>
  );
}

export function ReworkBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-red-500/30 bg-red-50 px-1.5 py-0 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
      <RotateCcw className="size-2.5" /> Rework
    </span>
  );
}

/** "2/4" garment-checklist progress chip, hidden once every step is done (nothing to draw
 *  attention to) and hidden entirely for orders with no checklist activity yet. */
export function ChecklistProgressChip({ order }: { order: Order }) {
  const { done, total } = orderChecklistProgress(order.garments || []);
  if (total === 0 || done === 0 || done === total) return null;
  return <span className="shrink-0 rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium tabular-nums text-muted-foreground">{done}/{total}</span>;
}

/**
 * Kanban board card. OrderCard(), Stitching_Manager_Pro_v16.html ~line 6033.
 * The stage is implied by the column, so the card omits the stage badge and spends
 * that space on the details a tailor actually scans for: who, what, when, how much.
 */
export function OrderCard({
  order,
  canChangeStage,
  onAdvance,
  advancing,
  shop,
  draggable,
  onDragStart,
  onDragEnd,
  dragging,
  onRecordPayment,
}: {
  order: Order;
  canChangeStage?: boolean;
  onAdvance?: (id: string) => void;
  advancing?: boolean;
  shop?: Shop;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  onRecordPayment?: (order: Order) => void;
}) {
  const next = getNextStage(order.status);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md",
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40"
      )}
    >
      <Link href={`/orders/${order.id}`} className="block p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">{order.name}</p>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{inr(order.total)}</span>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          {order.id}
          {order.orderType === "alteration" && <AlterationBadge />}
          {order.reworkFlag && <ReworkBadge />}
        </p>

        <p className="mt-2 truncate text-xs text-muted-foreground">{(order.garments || []).map((g) => g.type).join(", ") || "—"}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">{fmtDateShort(order.deliveryDate)}</span>
          <DueBadge order={order} />
          <ChecklistProgressChip order={order} />
          <BalanceDue amount={order.balance} suffix=" due" className="ml-auto text-[11px]" />
        </div>
      </Link>

      <div className="flex items-center gap-1.5 border-t bg-muted/30 p-1.5">
        {canChangeStage && next && (
          <Button
            size="sm"
            className={cn("h-8 min-w-0 flex-1 px-2 text-[11px]", STAGE_STYLE[next].solid)}
            disabled={advancing}
            onClick={(e) => {
              e.preventDefault();
              onAdvance?.(order.id);
            }}
          >
            {/* min-w-0 + truncate: this button shares a fixed-width row with two icon buttons
                (record payment, WhatsApp) on a kanban card — a long stage name (e.g. "Move to
                Delivered") could otherwise force the row wider than the card. */}
            <span className="truncate">{advancing ? "…" : `Move to ${STAGE_META[next].label}`}</span>
          </Button>
        )}
        {onRecordPayment && order.balance > 0 && (
          <Button
            variant="outline"
            size="icon-sm"
            className="size-8 shrink-0"
            aria-label={`Record payment for ${order.name}`}
            title="Record payment"
            onClick={(e) => {
              e.preventDefault();
              onRecordPayment(order);
            }}
          >
            <Wallet className="size-3.5" />
          </Button>
        )}
        <WhatsAppIconButton
          href={buildWhatsAppUrl(order, resolveWaType(order), shop)}
          label={`WhatsApp ${order.name}`}
          className="size-8"
        />
      </div>
    </div>
  );
}
