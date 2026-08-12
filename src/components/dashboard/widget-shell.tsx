"use client";

import { useRef } from "react";
import { GripVertical, EyeOff, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WidgetSize } from "@/lib/dashboard-widgets";

const SPAN_CLASS: Record<WidgetSize, string> = {
  sm: "sm:col-span-1",
  lg: "sm:col-span-2",
  full: "sm:col-span-4",
};

const RESIZE_LABEL: Record<WidgetSize, string> = {
  sm: "Expand to half width",
  lg: "Expand to full width",
  full: "Shrink to small",
};

export function WidgetShell({
  size,
  editing,
  dragging,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onHide,
  onResize,
  children,
}: {
  size: WidgetSize;
  editing: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onHide?: () => void;
  onResize?: () => void;
  children: React.ReactNode;
}) {
  // Drag is always available but only initiates when the grip handle is pressed,
  // so clicking links/buttons inside the card still works normally.
  const gripPressed = useRef(false);

  function handleDragStart(e: React.DragEvent) {
    if (!gripPressed.current) {
      e.preventDefault();
      return;
    }
    onDragStart?.(e);
  }

  function handleDragEnd() {
    gripPressed.current = false;
    onDragEnd?.();
  }

  return (
    <div
      className={cn(
        "group relative col-span-1",
        SPAN_CLASS[size],
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
      {/* Control bar — always rendered, fades in on card hover */}
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
          {onResize && (
            <button
              type="button"
              onClick={onResize}
              title={RESIZE_LABEL[size]}
              aria-label={RESIZE_LABEL[size]}
              className="flex size-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-primary/10 hover:text-primary"
            >
              {size === "full" ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          )}
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

      {/* Disable pointer events on content only while actively dragging */}
      <div className={cn(dragging && "pointer-events-none select-none")}>{children}</div>
    </div>
  );
}
