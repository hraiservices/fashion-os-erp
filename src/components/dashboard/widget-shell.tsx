"use client";

import { useRef } from "react";
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
  const gripPressed = useRef(false);
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
      const s = resizeState.current;
      const el = containerRef.current;
      if (!s || !el) return;
      const grid = el.closest("[data-dashboard-grid]") as HTMLElement | null;
      const gridW = grid ? grid.clientWidth : el.offsetWidth * 4;
      const colW = (gridW - 16 * 3) / 4;
      const newW = s.startW + (ev.clientX - s.startX);
      const newH = Math.max(80, s.startH + (ev.clientY - s.startY));
      s.lastCols = Math.max(1, Math.min(4, Math.round(newW / colW))) as 1 | 2 | 3 | 4;
      s.lastH = Math.round(newH);
      onResizeProgress?.(s.lastCols, s.lastH);
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (resizeState.current) onResizeEnd?.(resizeState.current.lastCols, resizeState.current.lastH);
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
      onClick={href ? (e) => {
        // Let internal links/buttons handle their own navigation
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
          onMouseDown={() => { gripPressed.current = true; }}
          onMouseUp={() => { gripPressed.current = false; }}
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
