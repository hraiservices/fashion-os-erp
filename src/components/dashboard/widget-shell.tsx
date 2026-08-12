"use client";

import { useRef } from "react";
import { GripVertical, EyeOff, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

const COL_SPAN_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
};

export function WidgetShell({
  colSpan,
  heightPx,
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
  children,
}: {
  colSpan: 1 | 2 | 3 | 4;
  heightPx?: number;
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
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gripPressed = useRef(false);
  const resizeState = useRef<{
    startX: number; startY: number;
    startW: number; startH: number;
    lastCols: 1 | 2 | 3 | 4; lastH: number;
  } | null>(null);

  // Drag reorder — only initiates when grip handle is pressed
  function handleDragStart(e: React.DragEvent) {
    if (!gripPressed.current) { e.preventDefault(); return; }
    onDragStart?.(e);
  }
  function handleDragEnd() {
    gripPressed.current = false;
    onDragEnd?.();
  }

  // Free-form resize — tracks mouse globally while handle is held
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
      const s = resizeState.current;
      const el = containerRef.current;
      if (!s || !el) return;

      const grid = el.closest("[data-dashboard-grid]") as HTMLElement | null;
      const gridW = grid ? grid.clientWidth : el.offsetWidth * 4;
      const GAP = 16, COLS = 4;
      const colW = (gridW - GAP * (COLS - 1)) / COLS;

      const newW = s.startW + (ev.clientX - s.startX);
      const newH = Math.max(80, s.startH + (ev.clientY - s.startY));
      const newCols = Math.max(1, Math.min(4, Math.round(newW / colW))) as 1 | 2 | 3 | 4;

      s.lastCols = newCols;
      s.lastH = Math.round(newH);
      onResizeProgress?.(newCols, s.lastH);
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (resizeState.current) {
        onResizeEnd?.(resizeState.current.lastCols, resizeState.current.lastH);
      }
      resizeState.current = null;
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative col-span-1",
        COL_SPAN_CLASS[colSpan],
        editing && "rounded-xl outline-dashed outline-2 outline-transparent transition-all hover:outline-primary/40",
        dragging && "opacity-40",
        dropTarget && "outline-primary/60"
      )}
      draggable
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={handleDragEnd}
    >
      {/* Hover control bar — grip (left) + resize indicator + hide (right) */}
      <div className="pointer-events-none absolute inset-x-0 -top-3 z-20 flex items-center justify-between px-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          aria-label="Drag to reorder"
          className="flex size-6 cursor-grab items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted active:cursor-grabbing"
          onMouseDown={() => { gripPressed.current = true; }}
          onMouseUp={() => { gripPressed.current = false; }}
        >
          <GripVertical className="size-3.5" />
        </button>
        <div className="flex items-center gap-1">
          {colSpan < 4
            ? <Maximize2 className="size-3 text-muted-foreground/50" />
            : <Minimize2 className="size-3 text-muted-foreground/50" />}
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              aria-label="Hide widget"
              className="flex size-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-destructive/10 hover:text-destructive"
            >
              <EyeOff className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Widget content — fixed height when set, scrollable */}
      <div
        className={cn(dragging && "pointer-events-none select-none")}
        style={heightPx ? { height: heightPx, overflow: "auto" } : undefined}
      >
        {children}
      </div>

      {/* Resize handle — bottom-right corner, visible on hover */}
      <div
        className="absolute bottom-0 right-0 z-20 h-5 w-5 cursor-se-resize opacity-0 transition-opacity group-hover:opacity-100"
        onMouseDown={handleResizeMouseDown}
        aria-label="Resize widget"
      >
        <svg viewBox="0 0 10 10" className="h-full w-full text-muted-foreground/60">
          <path d="M 9 1 L 9 9 L 1 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 9 5 L 5 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
