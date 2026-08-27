"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GripHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

const COL_SPAN_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
};

export function WidgetShell({
  colSpan,
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
  href?: string;
  editing: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onHide?: () => void;
  onResizeProgress?: (colSpan: 1 | 2 | 3 | 4) => void;
  onResizeEnd?: (colSpan: 1 | 2 | 3 | 4) => void;
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
    startX: number;
    startW: number;
    lastCols: 1 | 2 | 3 | 4;
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

  // Width-only resize — every widget's height now stretches to match its row (see the
  // container's default grid stretch below), so the old height-drag was dropped: letting
  // widgets pick their own pixel height is exactly what produced ragged, mismatched-height
  // cards sitting side by side in the same row.
  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    resizeState.current = { startX: e.clientX, startW: el.offsetWidth, lastCols: colSpan };

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
      s.lastCols = Math.max(1, Math.min(numCols, Math.round(newW / colW))) as 1 | 2 | 3 | 4;
      onResizeProgress?.(s.lastCols);
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (resizeState.current) onResizeEnd?.(resizeState.current.lastCols);
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
        // No self-start here: a CSS grid row stretches every cell to match its tallest sibling
        // by default, and that's exactly what we want — every widget in the same row ends up
        // the same height, instead of each card sizing to its own content and leaving a ragged
        // mix of heights across the row (the "scattered card" complaint).
        "group relative col-span-1",
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
          {/* Reset width to default */}
          {colSpan && onResetSize && (
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

      {/* Widget content — h-full plus [&>*]:h-full stretches the widget's own root element
          (each one is a plain <section>/<div>, not otherwise height-aware) to fill the row. */}
      <div className={cn("h-full [&>*]:h-full", dragging && "pointer-events-none select-none")}>
        {children}
      </div>

      {/* Resize zone — right edge, width only (see handleResizeMouseDown) */}
      <div
        className="absolute inset-y-0 right-0 z-20 flex w-3 cursor-ew-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
        onMouseDown={handleResizeMouseDown}
        title="Drag to resize width"
      >
        <div className="h-8 w-1 rounded-full bg-muted-foreground/30" />
      </div>
    </div>
  );
}
