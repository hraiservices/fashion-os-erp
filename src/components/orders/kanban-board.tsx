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
 * Desktop keeps the full multi-column horizontal-scroll board (users expect to swipe between
 * columns there). On phone widths, seeing several partial columns side by side reads as
 * confusing horizontal scroll rather than "a board" — so below `sm` this instead shows one
 * stage at a time (picked via a row of tab pills) at full width, no sideways scrolling.
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
  const [mobileStage, setMobileStage] = useState<Stage>(STAGES[0]);
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

  function renderColumn(stage: Stage, className?: string) {
    const meta = STAGE_META[stage];
    const style = STAGE_STYLE[stage];
    const Icon = style.icon;
    const items = orders.filter((o) => o.status === stage);
    return (
      <section
        key={stage}
        className={className}
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
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressPct}% complete</span>
      </div>

      {/* Mobile: one stage at a time, picked via tab pills — all stages visible at once in an
          even grid rather than a scrolling row (STAGES has 6 entries, so 3 columns × 2 rows). */}
      <div className="sm:hidden">
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {STAGES.map((stage) => {
            const meta = STAGE_META[stage];
            const count = orders.filter((o) => o.status === stage).length;
            const active = stage === mobileStage;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => setMobileStage(stage)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium truncate transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span className="truncate">{meta.label}</span>
                <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums", active ? "bg-primary-foreground/20" : "bg-muted")}>{count}</span>
              </button>
            );
          })}
        </div>
        {renderColumn(mobileStage)}
      </div>

      {/* Desktop: full multi-column board, horizontal scroll expected here. */}
      <div className="hidden gap-3 overflow-x-auto pb-4 sm:flex">
        {STAGES.map((stage) => renderColumn(stage, "w-72 shrink-0"))}
      </div>
    </div>
  );
}
