"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  trackUrlByMobile,
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
  /** Customer mobile → their public order-status link, for the {track_link} WhatsApp variable. */
  trackUrlByMobile?: Map<string, string>;
}) {
  const done = orders.filter((o) => o.status === "delivered" || o.status === "payment").length;
  const progressPct = orders.length ? Math.round((done / orders.length) * 100) : 0;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Stage | null>(null);
  const [mobileStage, setMobileStage] = useState<Stage>(STAGES[0]);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // Raw scroll metrics the custom red scrollbar below is derived from — kept as plain numbers
  // (not a pre-computed thumb%/opacity) so both the render math and the drag math work off the
  // same source of truth. Recomputed on mount, on every scroll of the board itself, and on
  // window resize (narrowing the window can newly reveal overflow that wasn't there before, and
  // vice versa).
  const [metrics, setMetrics] = useState({ scrollLeft: 0, maxScroll: 0, ratio: 1 });
  const draggingScrollRef = useRef<{ startX: number; startScrollLeft: number; scrollPerPx: number } | null>(null);

  useEffect(() => {
    const el = boardScrollRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setMetrics({
        scrollLeft: el.scrollLeft,
        // 4px slack — some browsers report scrollWidth a hair larger than clientWidth even when
        // fully scrolled, which would otherwise leave the bar at not-quite-full opacity forever.
        maxScroll: Math.max(0, el.scrollWidth - el.clientWidth - 4),
        ratio: el.scrollWidth > 0 ? el.clientWidth / el.scrollWidth : 1,
      });
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [orders]);

  const scrollProgress = metrics.maxScroll > 0 ? Math.min(1, metrics.scrollLeft / metrics.maxScroll) : 0;
  // Fades toward (but not all the way to) transparent as the board nears its last column, and
  // back to fully opaque scrolling back toward the first — floors at 0.25 rather than 0 so the
  // thumb stays visible/grabbable to scroll back even once you're all the way at the end.
  const barOpacity = 1 - scrollProgress * 0.75;
  const thumbWidthPct = Math.max(12, Math.min(100, metrics.ratio * 100));

  function onThumbPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    const board = boardScrollRef.current;
    if (!track || !board || metrics.maxScroll <= 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const trackWidth = track.clientWidth;
    const thumbWidthPx = (thumbWidthPct / 100) * trackWidth;
    const travelPx = Math.max(1, trackWidth - thumbWidthPx);
    draggingScrollRef.current = { startX: e.clientX, startScrollLeft: board.scrollLeft, scrollPerPx: metrics.maxScroll / travelPx };
  }

  function onThumbPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = draggingScrollRef.current;
    const board = boardScrollRef.current;
    if (!drag || !board) return;
    const dx = e.clientX - drag.startX;
    board.scrollLeft = Math.max(0, Math.min(metrics.maxScroll, drag.startScrollLeft + dx * drag.scrollPerPx));
  }

  function onThumbPointerUp() {
    draggingScrollRef.current = null;
  }
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

  // Best-effort — only among orders currently loaded on this board (whatever filters/search are
  // active), not a live query across every order ever created with this group_id. Good enough
  // for "at a glance"; the order detail page's own linked-orders list is the authoritative one.
  function groupSiblingsOf(o: Order) {
    return o.groupId ? orders.filter((sib) => sib.groupId === o.groupId) : [];
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
              trackUrl={trackUrlByMobile?.get(o.mobile)}
              groupSize={o.groupId ? groupSiblingsOf(o).length : undefined}
              groupTotal={o.groupId ? groupSiblingsOf(o).reduce((s, sib) => s + sib.total, 0) : undefined}
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

      {/* Red custom scrollbar — thicker than the progress bar above it, its own color so it reads
          as an instruction rather than another progress indicator, and an actual draggable
          control (not just a hint): the lighter thumb is sized to how much of the board is
          visible and moves as you scroll, and you can drag it directly to scroll the board.
          Fades toward (not all the way to) transparent as you approach the last column, and
          back to full opacity scrolling back toward the first. Sits alongside the native
          scrollbar below the board, not in place of it. Desktop-only (matches the board's own
          sm:flex) and only rendered while there's actually more board than fits on screen. */}
      {metrics.maxScroll > 0 && (
        <div
          ref={trackRef}
          className="relative hidden h-3.5 touch-none rounded-full bg-red-600 transition-opacity duration-200 sm:block"
          style={{ opacity: barOpacity }}
        >
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 text-[10px] font-normal leading-none text-black">
            Scroll to see next stage <span aria-hidden>›</span>
          </p>
          <div
            role="scrollbar"
            aria-controls="kanban-board-scroll"
            aria-orientation="horizontal"
            aria-valuenow={Math.round(scrollProgress * 100)}
            tabIndex={-1}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={onThumbPointerUp}
            onPointerCancel={onThumbPointerUp}
            className="absolute inset-y-0.5 cursor-grab rounded-full bg-white/70 shadow-sm ring-1 ring-black/5 active:cursor-grabbing"
            style={{ width: `${thumbWidthPct}%`, left: `${scrollProgress * (100 - thumbWidthPct)}%` }}
          />
        </div>
      )}

      {/* Desktop: full multi-column board, horizontal scroll expected here. */}
      <div id="kanban-board-scroll" ref={boardScrollRef} className="hidden gap-3 overflow-x-auto pb-4 sm:flex">
        {STAGES.map((stage) => renderColumn(stage, "w-72 shrink-0"))}
      </div>
    </div>
  );
}
