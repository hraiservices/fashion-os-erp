"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GripHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Height resize snaps to this increment (px) so two widgets resized to similar heights
// actually land on the SAME height, instead of off by a few px — the main cause of the
// "misaligned" look when cards sit side by side in the same grid row.
const HEIGHT_SNAP_PX = 20;

const COL_SPAN_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
};

export function WidgetShell({
  colSpan,
  heightPx,
  href,
  editing,
  dragging,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onHide,
  onResizeProgress,
  onResizeEnd,
  onResetSize,
  children,
}: {
  colSpan: 1 | 2 | 3 | 4;
  heightPx?: number;
  href?: string;
  editing: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onHide?: () => void;
  onResizeProgress?: (colSpan: 1 | 2 | 3 | 4, heightPx: number) => void;
  onResizeEnd?: (colSpan: 1 | 2 | 3 | 4, heightPx: number) => void;
  onResetSize?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  // State, not a ref: the container's `draggable` attribute below must actually re-render when
  // this changes. Previously the whole card was `draggable` unconditionally, and only
  // `handleDragStart` checked whether the grip was pressed — meaning any mousedown-and-move
  // anywhere on the card (a chart, a link, plain content) could start the browser's native drag
  // gesture and only get cancelled after the fact, causing exactly the flaky/unintentional-drag
  // feel reported. Now the card is only draggable while the grip is actually held down.
  const [gripActive, setGripActive] = useState(false);
  const gripPressed = useRef(false);
  const resizeDragged = useRef(false); // true if mouse moved during resize — suppresses the post-drag click
  const resizeState = useRef<{
    startX: number; startY: number;
    startW: number; startH: number;
    lastCols: 1 | 2 | 3 | 4; lastH: number;
  } | null>(null);

  function handleDragStart(e: React.DragEvent) {
    if (!gripPressed.current) { e.preventDefault(); return; }
    onDragStart?.(e);
  }
  function handleDragEnd() {
    gripPressed.current = false;
    setGripActive(false);
    onDragEnd?.();
  }

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    resizeState.current = {
      startX: e.clientX, startY: e.clientY,
      startW: el.offsetWidth, startH: el.offsetHeight,
      lastCols: colSpan, lastH: heightPx ?? el.offsetHeight,
    };

    function onMouseMove(ev: MouseEvent) {
      resizeDragged.current = true;
      const s = resizeState.current;
      const el = containerRef.current;
      if (!s || !el) return;
      const grid = el.closest("[data-dashboard-grid]") as HTMLElement | null;
      // Read the grid's REAL current column count and gap instead of assuming 4 columns /
      // 16px gap — the hardcoded assumption only held at the desktop breakpoint; below `sm`
      // the grid is actually 1 column, and any future gap/breakpoint change would silently
      // throw this off again. gridTemplateColumns is a space-separated track list, so its
      // length IS the live column count.
      let numCols = 4;
      let gapPx = 16;
      if (grid) {
        const cs = getComputedStyle(grid);
        const tracks = cs.gridTemplateColumns.split(" ").filter(Boolean);
        if (tracks.length > 0) numCols = tracks.length;
        const parsedGap = parseFloat(cs.columnGap || cs.gap || "16");
        if (!Number.isNaN(parsedGap)) gapPx = parsedGap;
      }
      const gridW = grid ? grid.clientWidth : el.offsetWidth * numCols;
      const colW = (gridW - gapPx * (numCols - 1)) / numCols;
      const newW = s.startW + (ev.clientX - s.startX);
      const rawH = Math.max(80, s.startH + (ev.clientY - s.startY));
      // Height snaps to a fixed row unit so resized cards land on shared height increments
      // instead of arbitrary pixels — this is what makes neighbouring cards' bottom edges
      // line up instead of leaving a ragged gap.
      const newH = Math.round(rawH / HEIGHT_SNAP_PX) * HEIGHT_SNAP_PX;
      s.lastCols = Math.max(1, Math.min(numCols, Math.round(newW / colW))) as 1 | 2 | 3 | 4;
      s.lastH = newH;
      onResizeProgress?.(s.lastCols, s.lastH);
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (resizeState.current) onResizeEnd?.(resizeState.current.lastCols, resizeState.current.lastH);
      resizeState.current = null;
      // The browser fires a click on the container after mouseup — clear the flag
      // in the next microtask so the onClick handler can read it first.
      setTimeout(() => { resizeDragged.current = false; }, 0);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        // self-start: a CSS grid row stretches every cell to match its tallest sibling by
        // default, so a widget with no custom height (or a shorter one) silently grows to fill
        // the row anyway, leaving empty space below its actual content — the other half of the
        // "misaligned" complaint, and one that isn't specific to resizing at all. self-start
        // makes every widget's box exactly as tall as its own content/heightPx, never stretched.
        "group relative col-span-1 self-start",
        COL_SPAN_CLASS[colSpan],
        editing && "rounded-xl outline-dashed outline-2 outline-transparent transition-all hover:outline-primary/40",
        dragging && "opacity-40",
        dropTarget && "outline-primary/60"
      )}
      draggable={gripActive}
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={handleDragEnd}
      onClick={href ? (e) => {
        if (resizeDragged.current) return; // drag just ended — not a real click
        if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
        router.push(href);
      } : undefined}
    >
      {/* Hover control bar — transparent, grip left, hide right */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between rounded-t-xl px-2 py-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          aria-label="Drag to reorder"
          className="cursor-grab text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
          onMouseDown={() => { gripPressed.current = true; setGripActive(true); }}
          onMouseUp={() => { gripPressed.current = false; setGripActive(false); }}
        >
          <GripHorizontal className="size-3.5" />
        </button>
        <div className="flex items-center gap-1">
          {/* Double-click resize zone to reset height/width to default */}
          {(heightPx || colSpan) && onResetSize && (
            <button
              type="button"
              onClick={onResetSize}
              title="Reset to default size"
              aria-label="Reset size"
              className="text-[10px] font-medium text-muted-foreground/50 hover:text-muted-foreground"
            >
              reset
            </button>
          )}
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              aria-label="Hide widget"
              className="text-muted-foreground/60 hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Widget content */}
      <div
        className={cn(dragging && "pointer-events-none select-none")}
        style={heightPx ? { height: heightPx, overflow: "auto" } : undefined}
      >
        {children}
      </div>

      {/* Resize zone — bottom-right corner, larger hit area, 3-dot indicator on hover */}
      <div
        className="absolute bottom-0 right-0 z-20 flex h-8 w-8 cursor-se-resize items-end justify-end p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        onMouseDown={handleResizeMouseDown}
        title="Drag to resize"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" className="text-muted-foreground/40">
          <circle cx="6" cy="6" r="1" fill="currentColor" />
          <circle cx="6" cy="2" r="1" fill="currentColor" />
          <circle cx="2" cy="6" r="1" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
