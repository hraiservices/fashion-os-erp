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

const MIN_HEIGHT_PX = 120;
// How close (px) a dragged card's height needs to get to a same-row neighbor's height before it
// snaps to match exactly — a magnetic-guide feel like design tools, not a hard grid step.
const HEIGHT_SNAP_TOLERANCE_PX = 4;
// How close (px) two cards' `top` positions need to be to count as "the same row" — cards laid
// out by the same grid row will have (near-)identical tops; a few px covers sub-pixel rounding.
const SAME_ROW_TOLERANCE_PX = 2;

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
  onResizeHeightProgress,
  onResizeHeightEnd,
  onResetSize,
  children,
}: {
  colSpan: 1 | 2 | 3 | 4;
  /** Manually-set pixel height, from the bottom-edge drag handle below, overriding the grid's
   *  default row-stretch (every card in a row matches the tallest one). Undefined = the normal
   *  stretched height. Set only when someone has explicitly dragged this one card taller/shorter
   *  than its row. */
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
  onResizeProgress?: (colSpan: 1 | 2 | 3 | 4) => void;
  onResizeEnd?: (colSpan: 1 | 2 | 3 | 4) => void;
  onResizeHeightProgress?: (heightPx: number) => void;
  onResizeHeightEnd?: (heightPx: number) => void;
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
  const heightResizeState = useRef<{ startY: number; startH: number; lastHeight: number } | null>(null);

  function handleDragStart(e: React.DragEvent) {
    if (!gripPressed.current) { e.preventDefault(); return; }
    onDragStart?.(e);
  }
  function handleDragEnd() {
    gripPressed.current = false;
    setGripActive(false);
    onDragEnd?.();
  }

  // Width-only resize. Pointer Events (not mouse-only) so this works from touch/pen as well as
  // a mouse — one event model instead of separate mouse/touch handling, which is what makes
  // this usable from a phone's Customize panel instead of desktop-only.
  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    resizeState.current = { startX: e.clientX, startW: el.offsetWidth, lastCols: colSpan };

    function onPointerMove(ev: PointerEvent) {
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

    function onPointerEnd() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("pointercancel", onPointerEnd);
      if (resizeState.current) onResizeEnd?.(resizeState.current.lastCols);
      resizeState.current = null;
      // The browser fires a click on the container after pointerup — clear the flag
      // in the next microtask so the onClick handler can read it first.
      setTimeout(() => { resizeDragged.current = false; }, 0);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerEnd);
    document.addEventListener("pointercancel", onPointerEnd);
  }

  // Manual height resize — bottom edge. Same Pointer Events approach as the width handle above,
  // so it works from touch too. Overrides the natural content height set by onResetSize
  // clearing it back to undefined.
  function handleResizeHeightStart(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    heightResizeState.current = { startY: e.clientY, startH: el.offsetHeight, lastHeight: el.offsetHeight };

    // Same-row neighbors, captured once at drag start (not every pointermove) — their own
    // heights don't change mid-drag since only THIS card is being resized.
    const grid = el.closest("[data-dashboard-grid]");
    const ownTop = el.getBoundingClientRect().top;
    const neighborHeights = grid
      ? Array.from(grid.children)
          .filter((child): child is HTMLElement => child instanceof HTMLElement && child !== el)
          .filter((child) => Math.abs(child.getBoundingClientRect().top - ownTop) <= SAME_ROW_TOLERANCE_PX)
          .map((child) => child.offsetHeight)
      : [];

    function onPointerMove(ev: PointerEvent) {
      resizeDragged.current = true;
      const s = heightResizeState.current;
      if (!s) return;
      const raw = Math.max(MIN_HEIGHT_PX, Math.round(s.startH + (ev.clientY - s.startY)));
      const snapTarget = neighborHeights.find((h) => Math.abs(h - raw) <= HEIGHT_SNAP_TOLERANCE_PX);
      s.lastHeight = snapTarget ?? raw;
      onResizeHeightProgress?.(s.lastHeight);
    }

    function onPointerEnd() {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("pointercancel", onPointerEnd);
      if (heightResizeState.current) onResizeHeightEnd?.(heightResizeState.current.lastHeight);
      heightResizeState.current = null;
      setTimeout(() => { resizeDragged.current = false; }, 0);
    }

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerEnd);
    document.addEventListener("pointercancel", onPointerEnd);
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative col-span-1",
        COL_SPAN_CLASS[colSpan],
        editing && "rounded-xl outline-dashed outline-2 outline-transparent transition-all hover:outline-primary/40",
        dragging && "opacity-40",
        dropTarget && "outline-primary/60",
        heightPx ? "overflow-y-auto" : undefined
      )}
      style={heightPx ? { height: heightPx } : undefined}
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
      {/* Control bar and resize handles only render while `editing` (the Customize panel is
          open — see app/(app)/dashboard/page.tsx) — previously they were hover-revealed at all
          times, which on a touchscreen meant never, since there's no hover state to reveal them
          from (a touch-only user had no way to reset a card stuck at an old manually-set size).
          Gating on `editing` instead of hover fixes that directly — reset/hide are plain taps,
          shown and tappable immediately once editing starts, no hover needed on any device — and
          also stops the bar from ever overlapping a card's own header content (its "View all" /
          "Full report" link, a live badge, …) during normal browsing, since it no longer appears
          outside of the dashed-outline edit mode at all. The grip (native HTML5 drag-and-drop)
          and the width/height resize handles below genuinely need a mouse, so they only render
          at `sm` and up even within editing — dragging doesn't work on touch regardless of
          whether the handle is visible. */}
      {editing && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between rounded-t-xl px-2 py-1">
          <button
            type="button"
            aria-label="Drag to reorder"
            className="hidden cursor-grab text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing sm:block"
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
      )}

      {/* h-full forces the widget's own root element to fill this container — which, since the
          grid stretches every card in a row to match the tallest one, is how a list-style
          widget's flex-1 content region actually grows to fill the row instead of leaving
          blank space below a short, natural-height list. */}
      <div className={cn("h-full [&>*]:h-full", dragging && "pointer-events-none select-none")}>
        {children}
      </div>

      {editing && (
        <>
          {/* Resize zone — right edge, width only (see handleResizeStart). touch-none stops the
              browser from treating a finger-drag here as a page scroll/pan instead of the resize
              gesture — critical for this to actually work on a touchscreen, not just a mouse. */}
          <div
            className="absolute inset-y-0 right-0 z-20 flex w-4 touch-none cursor-ew-resize items-center justify-center"
            onPointerDown={handleResizeStart}
            title="Drag to resize width"
          >
            <div className="h-8 w-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Resize zone — bottom edge, manual height override (see handleResizeHeightStart).
              Only rendered when a resize handler is actually wired up, same as onResetSize above. */}
          {onResizeHeightProgress && (
            <div
              className="absolute inset-x-0 bottom-0 z-20 flex h-4 touch-none cursor-ns-resize items-center justify-center"
              onPointerDown={handleResizeHeightStart}
              title="Drag to resize height"
            >
              <div className="h-1 w-8 rounded-full bg-muted-foreground/30" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
