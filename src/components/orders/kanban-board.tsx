"use client";

import { useRef, useState } from "react";
import { STAGES, STAGE_META, type Stage } from "@/lib/business-rules";
import { STAGE_STYLE } from "@/lib/design/stages";
import { OrderCard } from "@/components/orders/order-card";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";
import type { Shop } from "@/lib/settings";

/**
 * KanbanDesktop(), Stitching_Manager_Pro_v16.html ~line 6253.
 * Horizontal scroll is correct *here* (it's a board — users expect to swipe between
 * columns), with snap points so each column lands cleanly on touch devices.
 */
export function KanbanBoard({
  orders,
  canChangeStage,
  onAdvance,
  advancingId,
  shop,
  onSetStage,
  onRecordPayment,
}: {
  orders: Order[];
  canChangeStage?: boolean;
  onAdvance?: (id: string) => void;
  advancingId?: string | null;
  shop?: Shop;
  /** Drag-and-drop stage change. Omit to make the board read-only for dragging. */
  onSetStage?: (id: string, stage: Stage) => void;
  /** Omit to hide the Record Payment action (e.g. user lacks managePayments). */
  onRecordPayment?: (order: Order) => void;
}) {
  const done = orders.filter((o) => o.status === "delivered" || o.status === "payment").length;
  const progressPct = orders.length ? Math.round((done / orders.length) * 100) : 0;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Stage | null>(null);
  // The state above drives rendering, but dragover can fire before React has flushed the
  // dragstart update — so the handlers read the id from this ref, which is set synchronously.
  const draggingRef = useRef<string | null>(null);
  // Drag-and-drop is a pointer-device affordance; touch users keep the card's explicit
  // "Move to …" button, which is why that button stays regardless.
  const dndEnabled = !!(canChangeStage && onSetStage);

  function handleDrop(stage: Stage) {
    const id = draggingRef.current;
    draggingRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
    if (!id) return;
    const order = orders.find((o) => o.id === id);
    if (!order || order.status === stage) return;
    onSetStage?.(id, stage);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressPct}% complete</span>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:snap-none sm:px-0">
        {STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const style = STAGE_STYLE[stage];
          const Icon = style.icon;
          const items = orders.filter((o) => o.status === stage);
          return (
            <section
              key={stage}
              className="w-[17rem] shrink-0 snap-start sm:w-72"
              onDragOver={(e) => {
                if (!dndEnabled || !draggingRef.current) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropTarget(stage);
              }}
              onDragLeave={() => setDropTarget((t) => (t === stage ? null : t))}
              onDrop={(e) => {
                if (!dndEnabled) return;
                e.preventDefault();
                handleDrop(stage);
              }}
            >
              <header className={cn("flex items-center gap-2 rounded-t-xl border border-b-0 px-3 py-2.5", style.surface)}>
                <Icon className="size-4 shrink-0" />
                <h2 className="flex-1 truncate text-sm font-semibold">{meta.label}</h2>
                <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium tabular-nums">{items.length}</span>
              </header>
              <div
                className={cn(
                  "min-h-[6rem] space-y-2 rounded-b-xl border bg-muted/20 p-2 transition-colors",
                  dropTarget === stage && draggingId && "border-primary bg-primary/5 ring-1 ring-primary"
                )}
              >
                {items.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    canChangeStage={canChangeStage}
                    onAdvance={onAdvance}
                    advancing={advancingId === o.id}
                    shop={shop}
                    onRecordPayment={onRecordPayment}
                    draggable={dndEnabled}
                    dragging={draggingId === o.id}
                    onDragStart={(e) => {
                      draggingRef.current = o.id;
                      setDraggingId(o.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", o.id);
                    }}
                    onDragEnd={() => {
                      draggingRef.current = null;
                      setDraggingId(null);
                      setDropTarget(null);
                    }}
                  />
                ))}
                {items.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">{dropTarget === stage && draggingId ? "Drop here" : "Nothing here"}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
